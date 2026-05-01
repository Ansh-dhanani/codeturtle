import { generateObject, generateText, type LanguageModel } from "ai";
import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { Octokit } from "octokit";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { queryCodebase } from "./rag";
import { logger } from "@/lib/logger";
import {
  getReviewModesInstruction,
  normalizeCustomPrompt,
  normalizeRepoReviewModes,
  type RepoReviewStyle,
} from "@/module/repository/lib/settings";

const ReviewIssueSchema = z.object({
  title: z.string().default("Issue"),
  description: z.string().default("No description provided."),
  file: z.string().default("unknown"),
  severity: z.preprocess(
    (val) => {
      if (typeof val !== "string") return "warning";
      const v = val.toLowerCase();
      if (v === "critical" || v === "error" || v === "high" || v === "severe") return "critical";
      if (v === "warning" || v === "warn" || v === "medium" || v === "moderate") return "warning";
      return "info";
    },
    z.enum(["critical", "warning", "info"]),
  ),
  line: z.union([z.number(), z.string()]).optional().transform(v => typeof v === "string" ? parseInt(v, 10) || 0 : v),
  suggestion: z.string().default("No suggestion provided."),
}).transform((data) => ({
  ...data,
  title: data.title || "Issue",
  description: data.description || "No description provided.",
  file: data.file || "unknown",
  suggestion: data.suggestion || "No suggestion provided.",
}));

const ReviewSuggestionSchema = z.object({
  title: z.string().default("Suggestion"),
  description: z.string().default("No description provided."),
  file: z.string().default("unknown"),
  codeBefore: z.string().optional(),
  codeAfter: z.string().optional(),
}).transform((data) => ({
  ...data,
  title: data.title || "Suggestion",
  description: data.description || "No description provided.",
  file: data.file || "unknown",
}));

const CodeReviewSchema = z.object({
  summary: z.string().default("Reviewed and ready for feedback!"),
  overallScore: z.number().min(0).max(10).default(5),
  issues: z.array(ReviewIssueSchema).default([]),
  suggestions: z.array(ReviewSuggestionSchema).default([]),
  positives: z.array(z.string()).default([]),
  architectureNotes: z.string().optional(),
  diagram: z.string().optional(),
}).transform((data) => ({
  ...data,
  summary: data.summary || "No summary provided.",
  overallScore: typeof data.overallScore === "number" ? data.overallScore : 5,
  issues: Array.isArray(data.issues) ? data.issues : [],
  suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
  positives: Array.isArray(data.positives) ? data.positives : [],
}));

type CodeReview = z.infer<typeof CodeReviewSchema>;
type CodeReviewWithReviewer = CodeReview & {
  reviewerProvider: string;
  reviewerModel: string;
};

const REVIEW_MAX_TOKENS = 4096;
const REVIEW_LOW_CREDIT_MAX_TOKENS = 1200;
const REVIEW_FILE_CONTEXT_LIMIT = 8;
const REVIEW_EXTRA_CONTEXT_LIMIT = 4;
const MAX_DIFF_CHARS = 24000;
const MAX_RAG_CHARS = 8000;
const EST_CHAR_PER_TOKEN = 3.5;

const MODEL_CONTEXT_TOKENS: Record<string, number> = {
  "gemini-2.5-flash": 1048576,
  "gemini-2.5-pro": 1048576,
  "gemini-2.0-flash": 1048576,
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "o3-mini": 200000,
  "claude-sonnet-4-20250514": 200000,
  "claude-haiku-3-5-20241022": 200000,
  "llama-3.3-70b-versatile": 32768,
  "llama-3.1-8b-instant": 32768,
  "qwen/qwen3-coder:free": 32768,
  "moonshotai/kimi-k2": 163840,
  "nvidia/nemotron-3-nano-30b-a3b:free": 163840,
  "minimax/minimax-m2.5:free": 163840,
  "openai/gpt-oss-120b:free": 163840,
  "openai/gpt-oss-20b:free": 163840,
  "qwen/qwen3.6-plus:free": 32768,
  "arcee-ai/trinity-mini:free": 163840,
  "stepfun/step-3.5-flash:free": 163840,
  "openrouter/auto": 200000,
};

const PRISMA_MAX_RETRIES = 3;
const SEVERITY_ORDER: Record<"critical" | "warning" | "info", number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

type ParsedDiffContext = {
  changedFiles: Set<string>;
  changedLinesByFile: Map<string, Set<number>>;
};

function normalizeFilePath(value: string): string {
  return value.replace(/^a\//, "").replace(/^b\//, "").trim();
}

function normalizeTextForKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseChangedDiffContext(diff: string): ParsedDiffContext {
  const changedFiles = new Set<string>();
  const changedLinesByFile = new Map<string, Set<number>>();

  let currentFile: string | null = null;
  let currentNewLine = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const rawPath = line.slice(4).trim();
      if (!rawPath || rawPath === "/dev/null") {
        currentFile = null;
        continue;
      }
      currentFile = normalizeFilePath(rawPath);
      changedFiles.add(currentFile);
      if (!changedLinesByFile.has(currentFile)) {
        changedLinesByFile.set(currentFile, new Set<number>());
      }
      continue;
    }

    if (line.startsWith("@@ ")) {
      const match = line.match(/\+(\d+)(?:,(\d+))?/);
      if (match) {
        currentNewLine = Number(match[1]);
      }
      continue;
    }

    if (!currentFile) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      changedLinesByFile.get(currentFile)?.add(currentNewLine);
      currentNewLine += 1;
      continue;
    }

    if (line.startsWith(" ")) {
      currentNewLine += 1;
      continue;
    }

    if (line.startsWith("-")) {
      continue;
    }
  }

  return { changedFiles, changedLinesByFile };
}

function isNearChangedLine(context: ParsedDiffContext, file: string, line?: number): boolean {
  if (!line || !Number.isFinite(line)) return false;
  const lines = context.changedLinesByFile.get(file);
  if (!lines || lines.size === 0) return false;
  if (lines.has(line)) return true;

  for (let offset = 1; offset <= 3; offset += 1) {
    if (lines.has(line - offset) || lines.has(line + offset)) {
      return true;
    }
  }
  return false;
}

function getReviewCaps(modes: RepoReviewStyle[]): {
  maxIssues: number;
  maxSuggestions: number;
  maxPositives: number;
} {
  const shortMode = modes.includes("short");
  if (shortMode) {
    return { maxIssues: 4, maxSuggestions: 3, maxPositives: 2 };
  }
  return { maxIssues: 8, maxSuggestions: 6, maxPositives: 4 };
}

function detectIssueFamily(value: string): string | null {
  const normalized = normalizeTextForKey(value);
  if (/newline at end of file|missing newline|no newline at end of file|eof/.test(normalized)) return "newline";
  if (/placeholder|empty file|no functionality|non functional|dummy/.test(normalized)) return "placeholder";
  if (/naming|non standard file name|file name/.test(normalized)) return "naming";
  if (/lint|format|formatting/.test(normalized)) return "lint";
  return null;
}

function sanitizeReviewOutput(
  review: CodeReview,
  params: {
    diffContext: ParsedDiffContext;
    changedFiles: Set<string>;
    reviewModes: RepoReviewStyle[];
  },
): CodeReview {
  const { diffContext, changedFiles, reviewModes } = params;
  const { maxIssues, maxSuggestions, maxPositives } = getReviewCaps(reviewModes);

  const cleanedSummary = review.summary.trim().slice(0, 2500) || "Review generated successfully.";
  const boundedScore = Math.max(0, Math.min(10, Math.round(review.overallScore)));

  const normalizedIssues = review.issues
    .map((issue) => {
      const file = normalizeFilePath(issue.file || "");
      if (!file || !changedFiles.has(file)) return null;
      const line =
        typeof issue.line === "number" && Number.isFinite(issue.line) && issue.line > 0
          ? Math.round(issue.line)
          : undefined;

      return {
        ...issue,
        title: issue.title.trim().slice(0, 240),
        description: issue.description.trim().slice(0, 1600),
        suggestion: issue.suggestion.trim().slice(0, 1200),
        file,
        line: isNearChangedLine(diffContext, file, line) ? line : undefined,
      };
    })
    .filter((issue): issue is NonNullable<typeof issue> => Boolean(issue))
    .filter((issue) => issue.title.length > 0 && issue.description.length > 0 && issue.suggestion.length > 0)
    .sort((a, b) => {
      const severityDelta = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (severityDelta !== 0) return severityDelta;
      if (Boolean(a.line) !== Boolean(b.line)) return a.line ? -1 : 1;
      if (a.file !== b.file) return a.file.localeCompare(b.file);
      return (a.line || 0) - (b.line || 0);
    });

  const issues: typeof review.issues = [];
  const seenIssueKeys = new Set<string>();
  const familyByFile = new Set<string>();
  for (const issue of normalizedIssues) {
    if (issues.length >= maxIssues) break;
    const issueKey = [
      issue.file,
      issue.line || 0,
      normalizeTextForKey(issue.title),
      normalizeTextForKey(issue.description).slice(0, 120),
    ].join("|");
    if (seenIssueKeys.has(issueKey)) continue;

    const family = detectIssueFamily(`${issue.title} ${issue.description}`);
    const familyKey = family ? `${issue.file}|${family}` : null;
    if (familyKey && familyByFile.has(familyKey)) continue;

    seenIssueKeys.add(issueKey);
    if (familyKey) familyByFile.add(familyKey);
    issues.push(issue);
  }

  const suggestions = review.suggestions
    .map((suggestion) => {
      const file = normalizeFilePath(suggestion.file || "");
      if (!file || !changedFiles.has(file)) return null;

      return {
        ...suggestion,
        file,
        title: suggestion.title.trim().slice(0, 220),
        description: suggestion.description.trim().slice(0, 1200),
        codeBefore: suggestion.codeBefore?.slice(0, 4000),
        codeAfter: suggestion.codeAfter?.slice(0, 4000),
      };
    })
    .filter((suggestion): suggestion is NonNullable<typeof suggestion> => Boolean(suggestion))
    .filter((suggestion) => suggestion.title.length > 0 && suggestion.description.length > 0)
    .filter((suggestion, index, all) => {
      const key = `${suggestion.file}|${normalizeTextForKey(suggestion.title)}|${normalizeTextForKey(suggestion.description).slice(0, 120)}`;
      return all.findIndex((candidate) => {
        const candidateKey = `${candidate.file}|${normalizeTextForKey(candidate.title)}|${normalizeTextForKey(candidate.description).slice(0, 120)}`;
        return candidateKey === key;
      }) === index;
    })
    .slice(0, maxSuggestions);

  const positives = review.positives
    .map((positive) => positive.trim())
    .filter((positive) => positive.length > 0)
    .filter((positive, index, all) => all.findIndex((candidate) => normalizeTextForKey(candidate) === normalizeTextForKey(positive)) === index)
    .slice(0, maxPositives);

  const architectureNotes =
    review.architectureNotes?.trim().slice(0, 1200) ||
    (() => {
      const files = [...changedFiles].slice(0, 4);
      if (files.length === 0) return undefined;
      if (files.length === 1) {
        return `Architecture impact is localized to \`${files[0]}\`; no broad cross-module coupling changes were detected in this diff.`;
      }
      return `Architecture impact appears focused on: ${files.map((file) => `\`${file}\``).join(", ")}. No broad repository-wide refactor patterns were detected in this PR.`;
    })();

  const diagram = review.diagram?.trim();

  return {
    summary: cleanedSummary,
    overallScore: boundedScore,
    issues,
    suggestions,
    positives,
    architectureNotes,
    diagram: diagram ? diagram.slice(0, 6000) : undefined,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientPrismaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeCode = (error as { code?: string }).code;
  const message = (error as Error).message || "";

  if (maybeCode === "P1001" || maybeCode === "P1002" || maybeCode === "P1017") return true;
  return /(server has closed the connection|connection.*closed|can't reach database server|timed out)/i.test(message);
}

function getProviderScopedApiKey(provider: string, userApiKey?: string | null): string | undefined {
  if (!userApiKey) return undefined;

  const key = userApiKey.trim();
  if (!key) return undefined;

  if (provider === "openrouter") {
    return key.startsWith("sk-or-") ? key : undefined;
  }

  if (provider === "groq") {
    return key.startsWith("gsk_") ? key : undefined;
  }

  if (provider === "anthropic") {
    return key.startsWith("sk-ant-") ? key : undefined;
  }

  if (provider === "openai") {
    return key.startsWith("sk-") && !key.startsWith("sk-or-") && !key.startsWith("sk-ant-")
      ? key
      : undefined;
  }

  return undefined;
}

async function withPrismaRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let attempt = 0;

  while (attempt < PRISMA_MAX_RETRIES) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (!isTransientPrismaError(error) || attempt >= PRISMA_MAX_RETRIES) {
        throw error;
      }

      logger.warn("Transient Prisma error, retrying", {
        label,
        attempt,
        maxRetries: PRISMA_MAX_RETRIES,
        error: (error as Error).message,
      });

      await sleep(250 * attempt);
    }
  }

  throw new Error(`Prisma retry exhausted for ${label}`);
}

const BASE_SYSTEM_PROMPT = `You are a senior software engineer conducting a thorough code review.

Analyze the code for:
1. Bugs and logical errors
2. Security vulnerabilities
3. Performance issues
4. Code quality and maintainability
5. Best practices and patterns
6. Error handling
7. Edge cases

Be specific, actionable, and constructive. Reference exact file paths and line numbers when possible.

Score guidelines:
- 9-10: Excellent, production-ready
- 7-8: Good, minor improvements needed
- 5-6: Acceptable, some issues to address
- 3-4: Needs significant improvements
- 1-2: Major problems, rewrite needed`;

const JSON_OUTPUT_INSTRUCTIONS = `You must output a single JSON object that matches the requested schema.
Do not wrap the JSON in markdown. Do not include commentary outside JSON.
Use double quotes for all strings and keys. Do not use trailing commas.
If a field needs multiple lines, use \\n for newlines inside the JSON string.`;

const DIAGRAM_OUTPUT_INSTRUCTIONS = `Always populate the "diagram" field with a Mermaid diagram that maps the architecture, data flow, or control flow of the changed code.
Choose the most appropriate diagram type:
- flowchart TD: component trees, module dependencies, call graphs
- sequenceDiagram: request/response chains, API calls, async flows
Rules:
- Output raw Mermaid syntax only — no code fences, no explanation text
- Max 12 nodes; labels ≤4 words using real names from the diff
- Only show components that are directly touched by the changed files
- Every arrow must represent actual data or control flow, not just file proximity
- If the diff is small, prefer depth over breadth — trace one key flow end-to-end`;

function escapeControlCharsInString(value: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];

    if (!inString) {
      if (char === '"') {
        inString = true;
        escaped = false;
      }
      result += char;
      continue;
    }

    if (escaped) {
      escaped = false;
      result += char;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      result += char;
      continue;
    }

    if (char === '"') {
      inString = false;
      result += char;
      continue;
    }

    const code = char.charCodeAt(0);
    if (code < 0x20) {
      const hex = code.toString(16).padStart(2, "0");
      result += `\\u00${hex}`;
      continue;
    }

    result += char;
  }

  return result;
}

function parseReviewJson(raw: string): CodeReview {
  let candidate: string;
  
  // First try to extract JSON from markdown code blocks
  const jsonBlockMatch = raw.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    candidate = jsonBlockMatch[1].trim();
  } else {
    // Fall back to finding first { and last }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error(`No JSON found in response: ${raw.slice(0, 200)}`);
    }
    candidate = raw.slice(start, end + 1);
  }
  
  // Remove any remaining markdown
  candidate = candidate.replace(/```\w*\n?/g, '').trim();
  
  const sanitized = escapeControlCharsInString(candidate);
  
  try {
    const parsed = JSON.parse(sanitized);
    return CodeReviewSchema.parse(parsed);
  } catch (parseError) {
    console.error("Failed to parse review JSON:", parseError);
    console.error("Candidate was:", candidate.slice(0, 500));
    throw new Error(`Failed to parse AI response as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
  }
}

async function getPRDiff(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<string> {
  const response = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
    owner,
    repo,
    pull_number: prNumber,
    headers: {
      accept: "application/vnd.github.v3.diff",
    },
  });
  return response.data as unknown as string;
}

async function getPRFiles(octokit: Octokit, owner: string, repo: string, prNumber: number) {
  const { data: files } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
  });

  return files;
}

export async function generateCodeReview(params: {
  owner: string;
  repo: string;
  prNumber: number;
  userId: string;
  model?: string;
  provider?: string;
}): Promise<CodeReviewWithReviewer> {
  const { owner, repo, prNumber, userId, model, provider } = params;

  const user = await withPrismaRetry("load-user-ai-settings", () =>
    prisma.user.findUnique({
      where: { id: userId },
      select: { aiProvider: true, aiModel: true, aiApiKey: true },
    }),
  );

  const repositorySettings = await withPrismaRetry("load-repository-settings", () =>
    prisma.repository.findFirst({
      where: { owner, name: repo, userId },
      select: { reviewStyle: true, customPrompt: true, aiProvider: true, aiModel: true },
    }),
  );
  const reviewModes = normalizeRepoReviewModes(repositorySettings?.reviewStyle);
  const customPrompt = normalizeCustomPrompt(repositorySettings?.customPrompt, 2000);
  const diagramAllowed = true;
  const systemPrompt = [
    BASE_SYSTEM_PROMPT,
    JSON_OUTPUT_INSTRUCTIONS,
    DIAGRAM_OUTPUT_INSTRUCTIONS,
    "",
    `Repository style: ${getReviewModesInstruction(reviewModes)}`,
    customPrompt ? `Repository custom prompt: ${customPrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const repoProvider = repositorySettings?.aiProvider || null;
  const repoModel = repositorySettings?.aiModel || null;
  const selectedProvider = provider || repoProvider || user?.aiProvider || "google";
  const selectedModel = (model || (repoProvider ? repoModel : null) || user?.aiModel || "gemini-2.5-flash") as string;
  let normalizedSelectedModel = selectedModel;
  if (selectedProvider === "openrouter") {
    if (selectedModel === "moonshotai/kimi-k2:free") {
      normalizedSelectedModel = "moonshotai/kimi-k2";
    } else if (selectedModel === "qwen/qwen3-32b:free") {
      normalizedSelectedModel = "qwen/qwen3.6-plus:free";
    }
  }
  const userApiKey = getProviderScopedApiKey(selectedProvider, user?.aiApiKey);

  let octokit: Octokit | null = null;
  try {
    const { getInstallationOctokit } = await import("@/lib/github-app");
    octokit = await getInstallationOctokit(owner, repo);
    logger.info("Using GitHub App installation token for PR review", { owner, repo, prNumber });
  } catch (err) {
    logger.warn("GitHub App auth unavailable; falling back to user OAuth token", {
      owner,
      repo,
      prNumber,
      error: (err as Error).message,
    });
  }

  if (!octokit) {
    const account = await withPrismaRetry("load-github-account", () =>
      prisma.account.findFirst({
        where: { userId, providerId: "github" },
      }),
    );

    if (!account?.accessToken) {
      throw new Error("No usable GitHub credentials found (GitHub App or user OAuth token).");
    }

    octokit = new Octokit({ auth: account.accessToken });
  }

  const modelContextTokens = MODEL_CONTEXT_TOKENS[normalizedSelectedModel] || 32768;
  const systemTokens = Math.ceil(systemPrompt.length / EST_CHAR_PER_TOKEN);
  const outputTokens = REVIEW_MAX_TOKENS;
  const availableInputTokens = modelContextTokens - systemTokens - outputTokens - 500;
  const diffCharsBudget = Math.min(
    MAX_DIFF_CHARS,
    Math.floor(availableInputTokens * 0.6 * EST_CHAR_PER_TOKEN),
  );
  const ragCharsBudget = Math.min(
    MAX_RAG_CHARS,
    Math.floor(availableInputTokens * 0.3 * EST_CHAR_PER_TOKEN),
  );

  logger.info("Fetching PR data for review", { owner, repo, prNumber });

  const [diff, files] = await Promise.all([
    getPRDiff(octokit, owner, repo, prNumber),
    getPRFiles(octokit, owner, repo, prNumber),
  ]);

  const changedFiles = files
    .map((f) => f.filename)
    .filter((f) => /\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|css|scss|html|sql|json|yaml|yml|toml|md)$/i.test(f));
  const changedFilesSet = new Set(changedFiles.map((file) => normalizeFilePath(file)));
  const diffContext = parseChangedDiffContext(diff);

  let contextChunks: string[] = [];

  if (changedFiles.length > 0) {
    try {
      const repoRecord = await withPrismaRetry("load-repository-record", () =>
        prisma.repository.findFirst({
          where: { owner, name: repo, userId },
        }),
      );

      if (repoRecord) {
        const filesForContext = files
          .filter((f) => changedFilesSet.has(normalizeFilePath(f.filename)))
          .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions))
          .slice(0, REVIEW_FILE_CONTEXT_LIMIT)
          .map((f) => normalizeFilePath(f.filename));

        const fileQueries = filesForContext.map(async (file) => {
          return queryCodebase(`Show me the code in ${file}`, repoRecord.id, 3);
        });
        const extraQueries = [
          "Repository overview and architecture",
          "Shared types, utilities, and conventions",
          "Error handling and validation patterns",
          "Security considerations and data access patterns",
        ].map(async (query) => queryCodebase(query, repoRecord.id, 2));

        const [fileResults, extraResults] = await Promise.all([
          Promise.all(fileQueries),
          Promise.all(extraQueries),
        ]);

        const flattened = [...fileResults.flat(), ...extraResults.flat()];
        const seenPaths = new Set<string>();
        contextChunks = flattened
          .filter((result) => {
            if (!result?.path || seenPaths.has(result.path)) return false;
            seenPaths.add(result.path);
            return true;
          })
          .slice(0, REVIEW_FILE_CONTEXT_LIMIT + REVIEW_EXTRA_CONTEXT_LIMIT)
          .map((r) => {
            const maxPerFile = Math.floor(ragCharsBudget / (REVIEW_FILE_CONTEXT_LIMIT + REVIEW_EXTRA_CONTEXT_LIMIT));
            return `File: ${r.path}\n${r.content.slice(0, maxPerFile)}`;
          });
      }
    } catch (err) {
      logger.warn("Failed to fetch RAG context, proceeding without it", { error: (err as Error).message });
    }
  }

  const userPrompt = `Review this pull request in the repository ${owner}/${repo}.

${contextChunks.length > 0 ? `
## Relevant Codebase Context:
${contextChunks.join("\n\n---\n\n")}
` : ""}

## Pull Request Diff:
\`\`\`diff
${diff.slice(0, diffCharsBudget)}
\`\`\`

${files.length > 0 ? `
## Changed Files:
${files.map((f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`).join("\n")}
` : ""}

Provide a structured review with specific issues, suggestions, and an overall score.`;

  logger.info("Generating AI review", { owner, repo, prNumber, contextChunks: contextChunks.length, provider: selectedProvider, model: normalizedSelectedModel });

  const runReviewGeneration = async (modelToUse: LanguageModel, maxOutputTokens = REVIEW_MAX_TOKENS) => {
    try {
      return await generateObject({
        model: modelToUse,
        system: systemPrompt,
        prompt: userPrompt,
        schema: CodeReviewSchema,
        maxOutputTokens,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logger.warn("Structured output failed, retrying with JSON text", {
        owner,
        repo,
        prNumber,
        error: errorMessage,
      });

      const { text } = await generateText({
        model: modelToUse,
        system: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens,
      });

      const object = parseReviewJson(text);
      return { object };
    }
  };

  let aiModel;
  let reviewerProvider = selectedProvider;
  let reviewerModel = normalizedSelectedModel;
  if (selectedProvider === "openai") {
    const openAiApiKey = userApiKey || process.env.OPENAI_API_KEY;
    if (!openAiApiKey) {
      logger.warn("OPENAI_API_KEY is missing, falling back to Google Gemini", {
        owner,
        repo,
        prNumber,
      });
      reviewerProvider = "google";
      reviewerModel = "gemini-2.5-flash";
      aiModel = google(reviewerModel);
    } else {
      const openaiClient = createOpenAI({ apiKey: openAiApiKey });
      aiModel = openaiClient(normalizedSelectedModel);
    }
  } else if (selectedProvider === "groq") {
    const groqApiKey = userApiKey || process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      logger.warn("GROQ_API_KEY is missing, falling back to Google Gemini", {
        owner,
        repo,
        prNumber,
      });
      reviewerProvider = "google";
      reviewerModel = "gemini-2.5-flash";
      aiModel = google(reviewerModel);
    } else {
      const groqClient = createOpenAI({
        apiKey: groqApiKey,
        baseURL: "https://api.groq.com/openai/v1",
      });
      aiModel = groqClient(normalizedSelectedModel);
    }
  } else if (selectedProvider === "openrouter") {
    const openRouterApiKey = userApiKey || process.env.OPENROUTER_API_KEY;
    if (!openRouterApiKey) {
      logger.warn("OPENROUTER_API_KEY is missing, falling back to Google Gemini", {
        owner,
        repo,
        prNumber,
      });
      reviewerProvider = "google";
      reviewerModel = "gemini-2.5-flash";
      aiModel = google(reviewerModel);
    } else {
      const openRouterClient = createOpenAI({
        apiKey: openRouterApiKey,
        baseURL: "https://openrouter.ai/api/v1",
      });
      aiModel = openRouterClient(normalizedSelectedModel);
    }
  } else if (selectedProvider === "anthropic") {
    const anthropicApiKey = userApiKey || process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      logger.warn("ANTHROPIC_API_KEY is missing, falling back to Google Gemini", {
        owner,
        repo,
        prNumber,
      });
      reviewerProvider = "google";
      reviewerModel = "gemini-2.5-flash";
      aiModel = google(reviewerModel);
    } else {
      const anthropicClient = createAnthropic({ apiKey: anthropicApiKey });
      aiModel = anthropicClient(normalizedSelectedModel);
    }
  } else {
    aiModel = google(normalizedSelectedModel);
  }

  let object!: CodeReview;
  try {
    ({ object } = await runReviewGeneration(aiModel));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const noEndpointError = /no endpoints found/i.test(errorMessage);
    const insufficientCreditsError = /requires more credits|fewer max_tokens|can only afford|max_tokens/i.test(errorMessage);
    const providerReturnedError = /provider returned error|ai_apicallerror/i.test(errorMessage);
    const missingProviderKeyError = /api key is missing|loadapikeyerror|pass it using the 'apiKey' parameter/i.test(errorMessage);
    const modelLifecycleError = /decommissioned|no longer supported|unknown model|model .* not found|unsupported model/i.test(errorMessage);
    const outputParseError = /no object generated|json parsing failed|could not parse the response|bad control character|failed to parse ai response|no json found in response/i.test(errorMessage);
    const inputOverflowError = /input.*too.*(long|large)|context.*(length|overflow|exceed)|request.*too.*large|maximum context length|token.*limit/i.test(errorMessage);

    if (inputOverflowError) {
      logger.warn("Input overflow detected, retrying with Google Gemini and reduced input", {
        owner, repo, prNumber, selectedProvider, selectedModel: reviewerModel,
        error: errorMessage,
      });
      reviewerProvider = "google";
      reviewerModel = "gemini-2.5-flash";
      const reducedDiffBudget = Math.floor(diffCharsBudget * 0.4);
      const reducedRagBudget = Math.floor(ragCharsBudget * 0.2);
      const reducedPrompt = `Review this pull request in the repository ${owner}/${repo}.

${contextChunks.length > 0 ? `
## Relevant Codebase Context (truncated):
${contextChunks.map((c) => c.slice(0, Math.floor(reducedRagBudget / contextChunks.length))).join("\n\n---\n\n")}
` : ""}

## Pull Request Diff (truncated):
\`\`\`diff
${diff.slice(0, reducedDiffBudget)}
\`\`\`

${files.length > 0 ? `
## Changed Files:
${files.map((f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`).join("\n")}
` : ""}

Provide a structured review with specific issues, suggestions, and an overall score.`;
      const reducedRun = async (modelToUse: LanguageModel, maxOutputTokens = REVIEW_MAX_TOKENS) => {
        try {
          return await generateObject({ model: modelToUse, system: systemPrompt, prompt: reducedPrompt, schema: CodeReviewSchema, maxOutputTokens });
        } catch (err2) {
          const { text } = await generateText({ model: modelToUse, system: systemPrompt, prompt: reducedPrompt, maxOutputTokens });
          return { object: parseReviewJson(text) };
        }
      };
      ({ object } = await reducedRun(google(reviewerModel), REVIEW_MAX_TOKENS));
    } else if (outputParseError) {
      logger.warn("Model output parse failed; retrying with Google Gemini", {
        owner,
        repo,
        prNumber,
        selectedProvider,
        selectedModel: reviewerModel,
      });
      reviewerProvider = "google";
      reviewerModel = "gemini-2.5-flash";
      ({ object } = await runReviewGeneration(google(reviewerModel), REVIEW_MAX_TOKENS));
    } else if (selectedProvider === "openrouter" && (noEndpointError || insufficientCreditsError || providerReturnedError)) {
      logger.warn("OpenRouter review failed; attempting resilient fallback path", {
        owner,
        repo,
        prNumber,
        model: reviewerModel,
        noEndpointError,
        insufficientCreditsError,
        providerReturnedError,
      });

      const openRouterApiKey = userApiKey || process.env.OPENROUTER_API_KEY;
      if (openRouterApiKey) {
        const openRouterClient = createOpenAI({
          apiKey: openRouterApiKey,
          baseURL: "https://openrouter.ai/api/v1",
        });

        const fallbackModels = [
          "openrouter/auto",
          "qwen/qwen3-coder:free",
          "stepfun/step-3.5-flash:free",
          "openai/gpt-oss-20b:free",
          "nvidia/nemotron-3-nano-30b-a3b:free",
          "minimax/minimax-m2.5:free",
          "qwen/qwen3.6-plus:free",
          "meta-llama/llama-3.1-8b-instruct:free",
        ];

        let recovered = false;
        if (insufficientCreditsError) {
          try {
            ({ object } = await runReviewGeneration(openRouterClient(reviewerModel), REVIEW_LOW_CREDIT_MAX_TOKENS));
            recovered = true;
            logger.info("Recovered by reducing OpenRouter max tokens", {
              owner,
              repo,
              prNumber,
              model: reviewerModel,
              maxTokens: REVIEW_LOW_CREDIT_MAX_TOKENS,
            });
          } catch (reducedTokenErr) {
            logger.warn("Reduced-token retry failed on OpenRouter", {
              owner,
              repo,
              prNumber,
              model: reviewerModel,
              error: reducedTokenErr instanceof Error ? reducedTokenErr.message : "Unknown error",
            });
          }
        }

        for (const fallbackModel of fallbackModels) {
          if (recovered) break;
          if (fallbackModel === reviewerModel) continue;

          try {
            ({ object } = await runReviewGeneration(
              openRouterClient(fallbackModel),
              insufficientCreditsError ? REVIEW_LOW_CREDIT_MAX_TOKENS : REVIEW_MAX_TOKENS,
            ));
            reviewerProvider = "openrouter";
            reviewerModel = fallbackModel;
            recovered = true;
            logger.info("OpenRouter fallback model succeeded", {
              owner,
              repo,
              prNumber,
              fallbackModel,
            });
            break;
          } catch (fallbackErr) {
            logger.warn("OpenRouter fallback model failed", {
              owner,
              repo,
              prNumber,
              fallbackModel,
              error: fallbackErr instanceof Error ? fallbackErr.message : "Unknown error",
            });
          }
        }

        if (!recovered) {
          reviewerProvider = "google";
          reviewerModel = "gemini-2.5-flash";
          ({ object } = await runReviewGeneration(
            google(reviewerModel),
            insufficientCreditsError ? REVIEW_LOW_CREDIT_MAX_TOKENS : REVIEW_MAX_TOKENS,
          ));
          logger.info("Fell back to Google after OpenRouter endpoint failures", {
            owner,
            repo,
            prNumber,
          });
        }
      } else {
        reviewerProvider = "google";
        reviewerModel = "gemini-2.5-flash";
        ({ object } = await runReviewGeneration(
          google(reviewerModel),
          insufficientCreditsError ? REVIEW_LOW_CREDIT_MAX_TOKENS : REVIEW_MAX_TOKENS,
        ));
        logger.info("Fell back to Google because OpenRouter key is missing", {
          owner,
          repo,
          prNumber,
        });
      }
    } else if (missingProviderKeyError) {
      logger.warn("Provider key missing during generation; falling back to Google", {
        owner,
        repo,
        prNumber,
        selectedProvider,
        selectedModel: reviewerModel,
      });

      reviewerProvider = "google";
      reviewerModel = "gemini-2.5-flash";
      ({ object } = await runReviewGeneration(google(reviewerModel), REVIEW_MAX_TOKENS));
    } else if (selectedProvider === "groq" && (modelLifecycleError || providerReturnedError)) {
      logger.warn("Groq model failed; attempting Groq fallback models", {
        owner,
        repo,
        prNumber,
        selectedModel: reviewerModel,
      });

      const groqApiKey = userApiKey || process.env.GROQ_API_KEY;
      const groqClient = groqApiKey
        ? createOpenAI({
            apiKey: groqApiKey,
            baseURL: "https://api.groq.com/openai/v1",
          })
        : null;

      const groqFallbackModels = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
      let recovered = false;

      if (groqClient) {
        for (const fallbackModel of groqFallbackModels) {
          if (fallbackModel === reviewerModel) continue;

          try {
            ({ object } = await runReviewGeneration(groqClient(fallbackModel)));
            reviewerProvider = "groq";
            reviewerModel = fallbackModel;
            recovered = true;
            logger.info("Groq fallback model succeeded", { owner, repo, prNumber, fallbackModel });
            break;
          } catch (fallbackErr) {
            logger.warn("Groq fallback model failed", {
              owner,
              repo,
              prNumber,
              fallbackModel,
              error: fallbackErr instanceof Error ? fallbackErr.message : "Unknown error",
            });
          }
        }
      }

      if (!recovered) {
        reviewerProvider = "google";
        reviewerModel = "gemini-2.5-flash";
        ({ object } = await runReviewGeneration(google(reviewerModel), REVIEW_MAX_TOKENS));
        logger.info("Fell back to Google after Groq model failure", { owner, repo, prNumber });
      }
    } else if (selectedProvider === "anthropic" && (modelLifecycleError || providerReturnedError)) {
      logger.warn("Anthropic model failed; attempting Anthropic fallback models", {
        owner,
        repo,
        prNumber,
        selectedModel: reviewerModel,
      });

      const anthropicApiKey = userApiKey || process.env.ANTHROPIC_API_KEY;
      const anthropicClient = anthropicApiKey ? createAnthropic({ apiKey: anthropicApiKey }) : null;

      const anthropicFallbackModels = ["claude-haiku-3-5-20241022", "claude-sonnet-4-20250514"];
      let recovered = false;

      if (anthropicClient) {
        for (const fallbackModel of anthropicFallbackModels) {
          if (fallbackModel === reviewerModel) continue;

          try {
            ({ object } = await runReviewGeneration(anthropicClient(fallbackModel)));
            reviewerProvider = "anthropic";
            reviewerModel = fallbackModel;
            recovered = true;
            logger.info("Anthropic fallback model succeeded", { owner, repo, prNumber, fallbackModel });
            break;
          } catch (fallbackErr) {
            logger.warn("Anthropic fallback model failed", {
              owner,
              repo,
              prNumber,
              fallbackModel,
              error: fallbackErr instanceof Error ? fallbackErr.message : "Unknown error",
            });
          }
        }
      }

      if (!recovered) {
        reviewerProvider = "google";
        reviewerModel = "gemini-2.5-flash";
        ({ object } = await runReviewGeneration(google(reviewerModel), REVIEW_MAX_TOKENS));
        logger.info("Fell back to Google after Anthropic model failure", { owner, repo, prNumber });
      }
    } else if (selectedProvider === "openai" && (modelLifecycleError || providerReturnedError)) {
      logger.warn("OpenAI model failed; attempting OpenAI fallback models", {
        owner,
        repo,
        prNumber,
        selectedModel: reviewerModel,
      });

      const openAiApiKey = userApiKey || process.env.OPENAI_API_KEY;
      const openAiClient = openAiApiKey ? createOpenAI({ apiKey: openAiApiKey }) : null;

      const openAiFallbackModels = ["gpt-4o-mini", "gpt-4o"];
      let recovered = false;

      if (openAiClient) {
        for (const fallbackModel of openAiFallbackModels) {
          if (fallbackModel === reviewerModel) continue;

          try {
            ({ object } = await runReviewGeneration(openAiClient(fallbackModel)));
            reviewerProvider = "openai";
            reviewerModel = fallbackModel;
            recovered = true;
            logger.info("OpenAI fallback model succeeded", { owner, repo, prNumber, fallbackModel });
            break;
          } catch (fallbackErr) {
            logger.warn("OpenAI fallback model failed", {
              owner,
              repo,
              prNumber,
              fallbackModel,
              error: fallbackErr instanceof Error ? fallbackErr.message : "Unknown error",
            });
          }
        }
      }

      if (!recovered) {
        reviewerProvider = "google";
        reviewerModel = "gemini-2.5-flash";
        ({ object } = await runReviewGeneration(google(reviewerModel), REVIEW_MAX_TOKENS));
        logger.info("Fell back to Google after OpenAI model failure", { owner, repo, prNumber });
      }
    } else {
      throw err;
    }
  }

  const normalizedReview = sanitizeReviewOutput(object, {
    diffContext,
    changedFiles: changedFilesSet.size > 0 ? changedFilesSet : diffContext.changedFiles,
    reviewModes,
  });

  logger.info("AI review generated", {
    owner,
    repo,
    prNumber,
    score: normalizedReview.overallScore,
    issues: normalizedReview.issues.length,
    suggestions: normalizedReview.suggestions.length,
  });

  return {
    ...normalizedReview,
    reviewerProvider,
    reviewerModel,
  };
}

export async function generateFileReview(params: {
  filePath: string;
  content: string;
  repoId: string;
  userId: string;
}): Promise<CodeReview> {
  const { filePath, content, repoId } = params;

  const contextResults = await queryCodebase(
    `Related code patterns and conventions for ${filePath}`,
    repoId,
    5,
  );

  const contextChunks = contextResults.map((r) => `File: ${r.path}\n${r.content}`);

  const userPrompt = `Review this file: ${filePath}

${contextChunks.length > 0 ? `
## Related Code Context:
${contextChunks.join("\n\n---\n\n")}
` : ""}

## File Content:
\`\`\`
${content.slice(0, 20000)}
\`\`\`

Provide a structured review with specific issues, suggestions, and an overall score.`;

  try {
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      system: BASE_SYSTEM_PROMPT,
      prompt: userPrompt,
      schema: CodeReviewSchema,
      maxOutputTokens: REVIEW_MAX_TOKENS,
    });
    return object;
  } catch {
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      system: `${BASE_SYSTEM_PROMPT}\n${JSON_OUTPUT_INSTRUCTIONS}`,
      prompt: userPrompt,
      maxOutputTokens: REVIEW_MAX_TOKENS,
    });
    return parseReviewJson(text);
  }
}
