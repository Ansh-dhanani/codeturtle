import { generateObject, generateText, type LanguageModel } from "ai";
import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { Octokit } from "octokit";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { queryCodebase } from "./rag";
import { logger } from "@/lib/logger";
import { withTimeout } from "@/lib/with-timeout";
import {
  getReviewModesInstruction,
  normalizeCustomPrompt,
  normalizeRepoReviewModes,
  type RepoReviewStyle,
} from "@/module/repository/lib/settings";

// Shared Mermaid-diagram field: tolerates weak-model prose, drops invalid diagrams.
const diagramField = z.string().optional().transform(val => {
    if (!val) return val;
    const parsed = val.replace(/\\n/g, '\n');
    const validLines = [];
    for (const line of parsed.split('\n')) {
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();
      // Aggressive cutoff for weak LLM hallucinations (nested JSON, chat logic, etc)
      if (
        trimmed.startsWith('//') ||
        trimmed.startsWith('{') ||
        trimmed.startsWith('}') ||
        lower.includes('this is invalid json') ||
        lower.includes('entire_output') ||
        lower.includes('review summary:') ||
        trimmed.includes('```')
      ) {
        break;
      }
      validLines.push(line);
    }
    const candidate = validLines.join('\n').replace(/"/g, '').trim();
    // Weak models sometimes emit prose instead of a Mermaid diagram - drop it.
    if (!/flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|timeline|journey|gitGraph/i.test(candidate)) {
      return undefined;
    }
    return candidate;
});

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
  diagram: diagramField,
}).transform((data) => ({
  ...data,
  summary: data.summary || "No summary provided.",
  overallScore: typeof data.overallScore === "number" ? data.overallScore : 5,
  issues: Array.isArray(data.issues) ? data.issues : [],
  suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
  positives: Array.isArray(data.positives) ? data.positives : [],
}));

// Liberal schema for the post-generation judge pass. Tolerates noisy model
// output by falling back to empty arrays / defaults rather than failing.
const JudgeReviewSchema = z.object({
  summary: z.string().catch(""),
  overallScore: z.number().min(0).max(10).catch(5),
  issues: z.array(ReviewIssueSchema).catch([]),
  suggestions: z.array(ReviewSuggestionSchema).catch([]),
  positives: z.array(z.string()).catch([]),
  architectureNotes: z.string().optional(),
  diagram: z.string().optional(),
});

// --- Finding schema v2 (opt-in via CODETURTLE_FINDING_SCHEMA=v2) ---
// Every finding must prove itself: confidence, category, trigger/impact, and
// evidence strings that must occur in the reviewed context. Findings without
// evidence are dropped in sanitizeReviewOutput.
const FINDING_V2 = ["1", "true", "on", "yes"].includes(
  (process.env.CODETURTLE_FINDING_SCHEMA || "").toLowerCase(),
);

const V2_CATEGORIES = [
  "logic", "runtime", "security", "data-integrity", "api-contract",
  "concurrency", "performance", "error-handling", "testing", "maintainability",
] as const;

const ReviewIssueV2Schema = z.object({
  title: z.string().min(1).default("Finding"),
  description: z.string().default(""),
  file: z.string().default("unknown"),
  severity: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  category: z.enum(V2_CATEGORIES).default("logic"),
  confidence: z.number().min(0).max(1).default(0.7),
  trigger: z.string().default(""),
  impact: z.string().default(""),
  evidence: z.array(z.string()).default([]),
  suggestion: z.string().default("No suggestion provided."),
  line: z.union([z.number(), z.string()]).optional().transform(v => typeof v === "string" ? parseInt(v, 10) || 0 : v),
});

const CodeReviewV2Schema = z.object({
  summary: z.string().default("Reviewed and ready for feedback!"),
  overallScore: z.number().min(0).max(10).default(5),
  issues: z.array(ReviewIssueV2Schema).default([]),
  suggestions: z.array(ReviewSuggestionSchema).default([]),
  positives: z.array(z.string()).default([]),
  architectureNotes: z.string().optional(),
  diagram: diagramField,
});

const V2_SYSTEM_ADDENDUM = `CRITICAL — finding evidence contract (schema v2): every issue MUST include ALL of the following:
- "severity": one of "critical" | "high" | "medium" | "low". Never invent a critical.
- "category": one of "logic" | "runtime" | "security" | "data-integrity" | "api-contract" | "concurrency" | "performance" | "error-handling" | "testing" | "maintainability"
- "confidence": number 0-1. Anything below 0.5 will be discarded - do not report it.
- "trigger": the exact runtime/usage conditions that make it fail (min 1 sentence).
- "impact": the concrete consequence (min 1 sentence).
- "evidence": an array of 1-3 VERBATIM strings from the diff/context that prove the finding (exact identifiers, lines, config keys). Do NOT paraphrase evidence.
If you cannot produce trigger + impact + evidence for an issue, do NOT include that issue. An empty "issues" array is a valid, good answer.`;

/**
 * Last-resort review synthesized when every provider attempt failed.
 * Keeps the pipeline alive - the user still gets an informative comment
 * explaining what happened instead of a bare "Review failed" with no summary.
 */
function buildOfflineReview(owner: string, repo: string, prNumber: number, reason: string): CodeReview {
  const brief = reason.trim().replace(/\s+/g, " ").slice(0, 280);
  return {
    summary: `Automated review could not be completed right now (every configured provider failed - ${brief}). No findings were generated; please retry or check the PR settings. No code issues were verified.`,
    overallScore: 0,
    issues: [],
    suggestions: [],
    positives: [],
    architectureNotes: undefined,
    diagram: undefined,
  };
}

type CodeReview = z.infer<typeof CodeReviewSchema>;
type CodeReviewWithReviewer = CodeReview & {
  reviewerProvider: string;
  reviewerModel: string;
};

const REVIEW_MAX_TOKENS = 8192;
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
  "openai/gpt-oss-120b": 128000,
  "openai/gpt-oss-20b": 128000,
  "qwen/qwen3.8-27b": 128000,
  "allam-2-7b": 128000,
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

/** Pull up to 5 declared symbols out of a unified diff (added lines only) for exact-symbol RAG lookups. */
function extractDeclaredSymbols(diff: string): string[] {
  const symbols = new Set<string>();
  for (const raw of diff.split("\n")) {
    if (!raw.startsWith("+")) continue;
    const line = raw.slice(1);
    const match =
      /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(line) ||
      /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(line) ||
      /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(line) ||
      /(?:export\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/.exec(line);
    const name = match?.[1];
    if (name && name.length >= 3 && !/^(const|let|var|function|class|if|for|while|return|type|interface|enum)$/.test(name)) {
      symbols.add(name);
    }
    if (symbols.size >= 5) break;
  }
  return [...symbols];
}

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

const DIFF_COMPRESSION_THRESHOLD = MAX_DIFF_CHARS; // 24000
const HUNK_CONTEXT_LINES = 10;

function matchPathGlob(path: string, glob: string): boolean {
  const p = path.replace(/^\.\//, "");
  let g = glob.trim().replace(/^\.\//, "");
  if (!g) return false;
  // A trailing "/" (e.g. "docs/") is shorthand for that directory tree
  if (g.endsWith("/")) g = `${g}**`;
  const segments = g.split("**").map((segment) =>
    segment
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "."),
  );
  try {
    return new RegExp("^" + segments.join(".*") + "$").test(p);
  } catch {
    return false;
  }
}

function isExcludedFromDeepReview(filename: string, extraGlobs: string[] = []): boolean {
  const p = filename.toLowerCase();
  if (/(^|\/)\.yarn(\/|$)/.test(p)) return true;
  if (/(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|composer\.lock|gemfile\.lock|poetry\.lock|pipfile\.lock|cargo\.lock|go\.sum|packages\.lock\.json|flake\.lock)$/.test(p)) return true;
  if (/\.lock$/.test(p)) return true;
  if (/\.(png|jpe?g|gif|webp|ico|bmp|tiff?|svg|pdf|zip|gz|tgz|bz2|7z|rar|woff2?|ttf|otf|eot|mp4|mov|webm|mp3|wav|avi|min\.js|min\.css|map)$/.test(p)) return true;
  return extraGlobs.some((glob) => matchPathGlob(p, glob.toLowerCase()));
}

function splitDiffByFile(diff: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = diff.split("\n");
  let current: string[] | null = null;
  let currentFile: string | null = null;

  const flush = () => {
    if (current && currentFile) {
      sections.set(currentFile, current.join("\n"));
    }
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      flush();
      current = [line];
      const match = line.match(/b\/(.+)$/);
      currentFile = match ? normalizeFilePath(match[1]) : null;
      continue;
    }
    if (current) current.push(line);
  }
  flush();
  return sections;
}

// Keeps only hunks (all hunks contain changes) and trims long runs of context
// lines down to ~`contextLines` lines around each changed line.
function compressFileDiffSection(section: string, contextLines = HUNK_CONTEXT_LINES): string {
  const lines = section.split("\n");
  const out: string[] = [];
  let i = 0;

  // Keep file-level header lines (diff --git, index, ---, +++, etc.)
  while (i < lines.length && !lines[i].startsWith("@@")) {
    out.push(lines[i]);
    i += 1;
  }

  while (i < lines.length) {
    out.push(lines[i]); // @@ hunk header
    i += 1;
    const body: string[] = [];
    while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("diff --git ")) {
      body.push(lines[i]);
      i += 1;
    }

    const changeIdx = new Set<number>();
    body.forEach((line, idx) => {
      if (line.startsWith("+") || line.startsWith("-")) changeIdx.add(idx);
    });

    const keep = new Set<number>();
    for (const idx of changeIdx) {
      for (let d = -contextLines; d <= contextLines; d += 1) {
        const j = idx + d;
        if (j >= 0 && j < body.length) keep.add(j);
      }
    }

    let omitted = 0;
    for (let j = 0; j < body.length; j += 1) {
      if (keep.has(j) || changeIdx.size === 0) {
        if (omitted > 0) {
          out.push(`... (${omitted} unchanged line${omitted === 1 ? "" : "s"} omitted)`);
          omitted = 0;
        }
        out.push(body[j]);
      } else {
        omitted += 1;
      }
    }
    if (omitted > 0) {
      out.push(`... (${omitted} unchanged line${omitted === 1 ? "" : "s"} omitted)`);
    }
  }

  return out.join("\n");
}

type CompressedReviewContext = {
  diffForPrompt: string;
  statBlock: string;
  excludedFiles: string[];
  compressed: boolean;
  includedFiles: string[];
  truncatedFiles: string[];
};

function buildReviewContext(params: {
  diff: string;
  files: Array<{ filename: string; status: string; additions: number; deletions: number }>;
  diffCharsBudget: number;
  ignoreGlobs?: string[];
}): CompressedReviewContext {
  const { diff, files, diffCharsBudget, ignoreGlobs } = params;
  const extraGlobs = ignoreGlobs ?? [];

  const totalAdditions = files.reduce((sum, f) => sum + (f.additions || 0), 0);
  const totalDeletions = files.reduce((sum, f) => sum + (f.deletions || 0), 0);
  const statBlock = [
    "## Change Summary (git diff --stat)",
    ...files.map((f) => `${f.filename} | +${f.additions} -${f.deletions}`),
    `${files.length} file${files.length === 1 ? "" : "s"} changed, ${totalAdditions} additions(+), ${totalDeletions} deletions(-)`,
  ].join("\n");

  if (diff.length <= DIFF_COMPRESSION_THRESHOLD) {
    logger.info("Review context: no compression needed", {
      diffChars: diff.length,
      threshold: DIFF_COMPRESSION_THRESHOLD,
      includedFiles: files.length,
    });
    return {
      diffForPrompt: diff.slice(0, diffCharsBudget),
      statBlock,
      excludedFiles: [],
      compressed: false,
      includedFiles: files.map((f) => f.filename),
      truncatedFiles: [],
    };
  }

  const sections = splitDiffByFile(diff);
  const excludedFiles: string[] = [];
  const includedSections: Array<{ filename: string; content: string }> = [];

  for (const f of files) {
    if (isExcludedFromDeepReview(f.filename, extraGlobs)) {
      excludedFiles.push(f.filename);
      continue;
    }
    const section = sections.get(normalizeFilePath(f.filename));
    if (section) {
      includedSections.push({ filename: f.filename, content: compressFileDiffSection(section, HUNK_CONTEXT_LINES) });
    }
  }
  // Include diff sections not present in the files list (defensive).
  const knownFiles = new Set(files.map((f) => normalizeFilePath(f.filename)));
  for (const [name, section] of sections) {
    if (knownFiles.has(name)) continue;
    if (isExcludedFromDeepReview(name, extraGlobs)) {
      excludedFiles.push(name);
      continue;
    }
    includedSections.push({ filename: name, content: compressFileDiffSection(section, HUNK_CONTEXT_LINES) });
  }

  const budget = Math.min(diffCharsBudget, DIFF_COMPRESSION_THRESHOLD);
  const truncatedFiles: string[] = [];
  let assembled = includedSections.map((s) => s.content).join("\n");

  if (assembled.length > budget) {
    const perFileCap = Math.max(500, Math.floor(budget / Math.max(1, includedSections.length)));
    assembled = includedSections
      .map((s) => {
        if (s.content.length <= perFileCap) return s.content;
        truncatedFiles.push(s.filename);
        return `${s.content.slice(0, perFileCap)}\n... (truncated ${s.content.length - perFileCap} chars)`;
      })
      .join("\n");
    if (assembled.length > budget) {
      assembled = `${assembled.slice(0, budget)}\n... (diff truncated)`;
    }
  }

  const includedFiles = includedSections.map((s) => s.filename);
  logger.info("Review context compressed", {
    originalDiffChars: diff.length,
    compressedDiffChars: assembled.length,
    compressionRatio: Number((assembled.length / Math.max(1, diff.length)).toFixed(3)),
    includedFiles: includedFiles.length,
    truncatedFiles: truncatedFiles.length,
    excludedFiles: excludedFiles.length,
    truncatedFileNames: truncatedFiles.slice(0, 20),
    excludedFileNames: excludedFiles.slice(0, 20),
  });

  return {
    diffForPrompt: assembled,
    statBlock,
    excludedFiles,
    compressed: true,
    includedFiles,
    truncatedFiles,
  };
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
  return { maxIssues: 5, maxSuggestions: 4, maxPositives: 3 };
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
    contextText?: string;
  },
): CodeReview {
  const { diffContext, changedFiles, reviewModes, contextText } = params;
  const { maxIssues, maxSuggestions, maxPositives } = getReviewCaps(reviewModes);

  const cleanedSummary = review.summary.trim().slice(0, 2500) || "Review generated successfully.";
  const boundedScore = Math.max(0, Math.min(10, Math.round(review.overallScore)));

  // Deterministic verification (schema v2 / evidence-bearing findings):
  // drop anything the context can't prove. No proof, no publish.
  const haystack = contextText?.toLowerCase() ?? "";
  const passesVerification = (issue: Record<string, unknown>): boolean => {
    const hasV2Fields =
      typeof issue.confidence === "number" || Array.isArray(issue.evidence) || typeof issue.trigger === "string";
    if (!hasV2Fields && !FINDING_V2) return true;
    if (typeof issue.confidence === "number" && issue.confidence < 0.5) return false;
    const evidence = Array.isArray(issue.evidence) ? (issue.evidence as string[]) : [];
    const trigger = typeof issue.trigger === "string" ? issue.trigger.trim() : "";
    const impact = typeof issue.impact === "string" ? issue.impact.trim() : "";
    if (FINDING_V2 && (!trigger || !impact)) return false;
    if (evidence.length === 0) return !FINDING_V2; // no evidence -> drop only in strict mode
    if (!haystack) return true; // no context available to check against
    return evidence.some((entry) => {
      const needle = String(entry || "").trim().toLowerCase().slice(0, 120);
      return needle.length >= 4 && haystack.includes(needle);
    });
  };

  // v2 severities downgrade to the legacy enum the render/judge pipeline understands
  const downgradeSeverity = (severity: string): "critical" | "warning" | "info" => {
    if (severity === "critical" || severity === "warning" || severity === "info") return severity;
    return severity === "low" ? "info" : "warning"; // high/medium -> warning
  };

  const normalizedIssues = review.issues
    .map((issue) => {
      const file = normalizeFilePath(issue.file || "");
      if (!file || !changedFiles.has(file)) return null;
      if (!passesVerification(issue as unknown as Record<string, unknown>)) return null;
      const line =
        typeof issue.line === "number" && Number.isFinite(issue.line) && issue.line > 0
          ? Math.round(issue.line)
          : undefined;

      return {
        ...issue,
        severity: downgradeSeverity(String(issue.severity || "warning")),
        title: issue.title.trim().slice(0, 240),
        description: issue.description.trim().slice(0, 1600),
        suggestion: issue.suggestion.trim().slice(0, 1200),
        file,
        line: isNearChangedLine(diffContext, file, line) ? line : undefined,
      };
    })
    .filter((issue): issue is NonNullable<typeof issue> => Boolean(issue))
    .filter((issue) => issue.title.length > 0 && issue.description.length > 0 && issue.suggestion.length > 0)
    .filter((issue) => {
      // Drop placeholder issues: model returned an essentially empty JSON object,
      // and our schema defaults fabricated the rest.
      const placeholderTitle = /^issue$/i.test(issue.title.trim());
      const placeholderDesc = /^no description provided\.?$/i.test(issue.description.trim());
      return !(placeholderTitle && placeholderDesc);
    })
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

  // Only keep architecture notes the model explicitly provided. Never fabricate filler from file names.
  const architectureNotes = review.architectureNotes?.trim().slice(0, 1200) || undefined;

  // Drop padding-y notes the model often invents for trivial diffs.
  const meaningfulArchNotes =
    architectureNotes &&
    !/^architecture impact (is|appears)/i.test(architectureNotes) &&
    architectureNotes.length >= 40
      ? architectureNotes
      : undefined;

  const diagram = review.diagram?.trim();

  return {
    summary: cleanedSummary,
    overallScore: boundedScore,
    issues,
    suggestions,
    positives,
    architectureNotes: meaningfulArchNotes,
    diagram: diagram ? diagram.slice(0, 6000) : undefined,
  };
}

async function judgeReviewIfPossible(
  review: CodeReview,
  context: {
    owner: string;
    repo: string;
    prNumber: number;
    prContextBlock: string;
    diffExcerpt: string;
    statBlock: string;
  },
): Promise<CodeReview> {
  try {
    // Judge stays on the same verified model as the default reviewer - never
    // route the judge through openrouter/auto (its free pool can hand us a broken model).
    const judgeModel = google("gemini-2.5-flash");
    const judgeModelName = "gemini-2.5-flash";

    const judgePrompt = `You are a strict code-review judge. Given the pull request context and a generated code review (JSON), return an UPDATED review JSON containing ONLY the findings that are:
(a) clearly grounded in the actual diff/code shown below,
(b) actionable by the author,
(c) not pure style nitpicks (unless the repository explicitly asked for style review).

Remove any issue/suggestion that is generic, vague, speculative, duplicates another finding, or cannot be tied to a specific location in the diff. Do NOT invent new findings. Do NOT add issues that were not in the original review. Keep the "summary" and "overallScore" fields (you may keep them unchanged). "positives" should only keep specific, grounded positives. Empty arrays are fine.

STRICT VERIFICATION RULE: A finding may only survive if its claim is verifiable from the context above. If you cannot point to the exact code in the diff/context that proves the finding (or directly refutes an existing guard/check), DROP the finding. "Plausible" is not "verified". If nothing survives verification, return zero issues - an empty, honest review is the correct outcome.

## Pull Request Context:
${context.prContextBlock || "(none)"}

${context.statBlock}

## Diff Excerpt:
\`\`\`diff
${context.diffExcerpt}
\`\`\`

## Generated Review JSON:
${JSON.stringify(review)}

Return ONLY the updated JSON object.`;

    const { object } = await withTimeout(
      () =>
        generateObject({
          model: judgeModel,
          system:
            "You are a strict, impartial code-review judge. You filter false positives and weak findings from a generated code review. You never invent new findings. You always output valid JSON matching the schema.",
          prompt: judgePrompt,
          schema: JudgeReviewSchema,
          maxOutputTokens: REVIEW_MAX_TOKENS,
        }),
      60_000,
      "judgeReview",
    );

    const score = Number(object.overallScore);
    const judged: CodeReview = {
      summary: object.summary?.trim() ? object.summary.trim() : review.summary,
      overallScore: Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : review.overallScore,
      issues: object.issues ?? [],
      suggestions: object.suggestions ?? [],
      positives: (object.positives ?? []).map((p) => p.trim()).filter((p) => p.length > 0),
      architectureNotes: object.architectureNotes ?? review.architectureNotes,
      diagram: object.diagram ?? review.diagram,
    };

    logger.info("Judge pass completed", {
      owner: context.owner,
      repo: context.repo,
      prNumber: context.prNumber,
      judgeModel: judgeModelName,
      removedIssues: Math.max(0, review.issues.length - judged.issues.length),
      removedSuggestions: Math.max(0, review.suggestions.length - judged.suggestions.length),
      removedPositives: Math.max(0, review.positives.length - judged.positives.length),
      remainingIssues: judged.issues.length,
      remainingSuggestions: judged.suggestions.length,
      remainingPositives: judged.positives.length,
    });

    return judged;
  } catch (err) {
    logger.warn("Judge pass failed; returning original review unchanged", {
      owner: context.owner,
      repo: context.repo,
      prNumber: context.prNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    return review;
  }
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

const BASE_SYSTEM_PROMPT = `You are a world-class senior software engineer conducting a thorough code review - on par with CodeRabbit.

Analyze the code for:
1. Bugs and logical errors (null/undefined derefs, off-by-one, race conditions, dead code)
2. Security vulnerabilities (injection, auth missing, secret leakage, unsafe eval, prototype pollution)
3. Performance issues (N+1 queries, unnecessary re-renders, blocking work on hot path)
4. Error handling (swallowed errors, missing retry/backoff, unhandled promise rejections)
5. Code quality (naming, single responsibility, cohesion, dead imports)
6. Edge cases (empty states, boundary inputs, overflow, timezones)
7. Type safety and best practices for the language/framework in use

Be specific, actionable, and constructive:
- Reference exact file paths and line numbers whenever possible.
- For every issue, supply a concrete, minimal suggested fix. If a fix changes code, include REAL code snippets in the suggestion (not pseudocode).
- For "Suggestions", you MUST include working codeBefore and codeAfter (the exact snippet to replace and the exact replacement) whenever the change is mechanical. Only omit codeBefore/codeAfter when the suggestion is purely architectural/verbal and cannot be expressed as code.
- Do NOT invent APIs, files, or functions that don't exist in the repository context. If unsure, say so in the issue description.
- Prefer 2-5 high-impact, correct findings over a long list of nitpicks. Empty arrays are fine - an empty review is better than a padded one.

Score guidelines:
- 9-10: Excellent, production-ready, ship it
- 7-8: Good, minor improvements needed
- 5-6: Acceptable, address the listed issues before merging
- 3-4: Needs significant work; block merge until issues are resolved
- 1-2: Major problems, rewrite needed`;

const JSON_OUTPUT_INSTRUCTIONS = `You must output a single strictly valid JSON object that matches the requested schema EXACTLY!
Do NOT wrap the JSON in markdown code blocks. Do NOT output any chain-of-thought, commentary, or text outside the JSON.
CRITICAL JSON RULES:
- Use double quotes for all strings and keys.
- You can use standard newlines inside the diagram string.
- Ensure all braces and quotes are perfectly closed.
- Every string field must be present and non-empty when applicable; empty arrays are fine for issues/suggestions/positives.`;

const DIAGRAM_OUTPUT_INSTRUCTIONS = `The "diagram" field is OPTIONAL. Omit it entirely unless the changed code involves a genuinely non-obvious multi-step architecture (a new service integration, a cross-module refactor, or a non-trivial data/request pipeline).
For ordinary reviews, local bug fixes, or small features, you MUST omit the "diagram" field - do NOT draw a trivial A->B->C flowchart just to fill the section.
If you do include one:
Choose the most appropriate diagram type:
- flowchart TD: component trees, module dependencies, call graphs
- sequenceDiagram: request/response chains, API calls, async flows
Rules:
- Output raw Mermaid syntax only - no markdown fences.
- Max 12 nodes; labels ≤4 words using real names from the diff.
- Do NOT use double quotes inside Mermaid labels to avoid breaking JSON string bounds.
- The diagram must add information the summary does not already convey; if unsure, omit it.`;

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
    return (FINDING_V2 ? CodeReviewV2Schema : CodeReviewSchema).parse(parsed) as CodeReview;
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
  headSha?: string;
}): Promise<CodeReviewWithReviewer> {
  const { owner, repo, prNumber, userId, model, provider, headSha } = params;

  const user = await withPrismaRetry("load-user-ai-settings", () =>
    prisma.user.findUnique({
      where: { id: userId },
      select: { aiProvider: true, aiModel: true, aiApiKey: true },
    }),
  );
  // Keys are stored encrypted at rest - decrypt server-side; never sent back to the client.
  // A bad key must not kill the whole review - fall back to no key (free models / server keys).
  const { decryptApiKey } = await import("@/lib/crypto");
  let decryptedUserKey: string | undefined;
  try {
    decryptedUserKey = decryptApiKey(user?.aiApiKey) ?? undefined;
  } catch (err) {
    logger.warn("Failed to decrypt user AI key; continuing without it", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    decryptedUserKey = undefined;
  }

  const repositorySettings = await withPrismaRetry("load-repository-settings", () =>
    prisma.repository.findFirst({
      where: { owner, name: repo, userId },
      select: { reviewStyle: true, customPrompt: true, aiProvider: true, aiModel: true, reviewIgnoreGlobs: true },
    }),
  );
  const reviewModes = normalizeRepoReviewModes(repositorySettings?.reviewStyle);
  const customPrompt = normalizeCustomPrompt(repositorySettings?.customPrompt, 2000);
  const diagramAllowed = reviewModes.includes("diagram");

  // Feedback loop: fold in the findings this user rejected recently so the
  // analyzer does not repeat known false positives.
  let rejectedFindingsBlock = "";
  try {
    const rejected = await prisma.reviewFeedback.findMany({
      where: { userId, rating: -1 },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { findingKey: true },
    });
    const lines = rejected
      .map((r) => r.findingKey.replace(/^issue:/, "").replace(/^suggestion:/, "suggestion: "))
      .filter((line) => line.trim().length > 3)
      .slice(0, 8);
    if (lines.length > 0) {
      rejectedFindingsBlock = [
        "",
        "Findings this user marked NOT HELPFUL (avoid repeating these; only report something similar if the evidence is undeniable):",
        ...lines.map((line) => `- ${line}`),
      ].join("\n");
    }
  } catch (feedbackErr) {
    logger.warn("Could not load rejected-findings feedback; continuing", {
      userId,
      error: feedbackErr instanceof Error ? feedbackErr.message : String(feedbackErr),
    });
  }
  const systemPrompt = [
    BASE_SYSTEM_PROMPT,
    JSON_OUTPUT_INSTRUCTIONS,
    diagramAllowed ? DIAGRAM_OUTPUT_INSTRUCTIONS : "Do NOT include or generate a diagram field. You must omit it.",
    "",
    `Repository style: ${getReviewModesInstruction(reviewModes)}`,
    customPrompt ? `Repository custom prompt: ${customPrompt}` : "",
    rejectedFindingsBlock || "",
  ]
    .filter(Boolean)
    .join("\n");

  const repoProvider = repositorySettings?.aiProvider || null;
  const repoModel = repositorySettings?.aiModel || null;
  const explicitConfig = Boolean(provider || repoProvider || user?.aiProvider);
  let selectedProvider = provider || repoProvider || user?.aiProvider || "google";
  let selectedModel = (model || (repoProvider ? repoModel : null) || user?.aiModel || "gemini-2.5-flash") as string;
  if (!explicitConfig) {
    // No provider/model configured anywhere - use a stable default.
    const { getDefaultReviewModel } = await import("@/lib/ai-catalog");
    const def = getDefaultReviewModel();
    selectedProvider = def.provider;
    selectedModel = def.model;
    logger.info("No AI model configured; using default", {
      owner,
      repo,
      prNumber,
      provider: def.provider,
      model: def.model,
    });
  }

  // Guard against stale persisted model slugs that no longer exist in the live catalog
  if (selectedProvider === "openrouter") {
    try {
      const { getLiveCatalog } = await import("@/lib/ai-catalog");
      const catalog = await getLiveCatalog();
      const liveIds = catalog
        .find((p) => p.id === "openrouter")
        ?.models.map((m) => m.id) ?? [];
      if (selectedModel !== "openrouter/auto" && !liveIds.includes(selectedModel)) {
        logger.warn("Configured OpenRouter model not in live catalog; falling back to openrouter/auto", {
          owner,
          repo,
          prNumber,
          configured: selectedModel,
          liveCount: liveIds.length,
        });
        selectedModel = "openrouter/auto";
      }
    } catch (catalogErr) {
      logger.warn("Could not validate OpenRouter model against live catalog; keeping configured model", {
        error: catalogErr instanceof Error ? catalogErr.message : "Unknown error",
        configured: selectedModel,
      });
    }
  }

  let normalizedSelectedModel = selectedModel;
  if (selectedProvider === "openrouter") {
    if (selectedModel === "moonshotai/kimi-k2:free") {
      normalizedSelectedModel = "moonshotai/kimi-k2";
    } else if (selectedModel === "qwen/qwen3-32b:free") {
      normalizedSelectedModel = "qwen/qwen3.6-plus:free";
    }
  }
  const userApiKey = getProviderScopedApiKey(selectedProvider, decryptedUserKey);

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

  // Read-through cache: re-runs of the same head SHA skip the GitHub fetch + RAG entirely.
  const { getCachedReviewContext, setCachedReviewContext } = await import("@/lib/review-cache");
  const reviewContextCacheKey = headSha ? `review-ctx:${owner}/${repo}#${headSha}` : null;
  const cachedContext = reviewContextCacheKey
    ? await getCachedReviewContext(reviewContextCacheKey)
    : null;

  let diff: string;
  let files: Array<{ filename: string; status: string; additions: number; deletions: number }>;
  let prTitle: string;
  let prBody: string;
  let prCommits: number | null;
  let prBaseRef: string;
  let prHeadRef: string;
  let cachedContextChunks: string[] | null = null;

  if (cachedContext) {
    ({ diff, files, prTitle, prBody, prCommits, prBaseRef, prHeadRef } = cachedContext);
    cachedContextChunks = cachedContext.contextChunks;
  } else {
    const [fetchedDiff, fetchedFiles, prMeta] = await Promise.all([
      getPRDiff(octokit, owner, repo, prNumber),
      getPRFiles(octokit, owner, repo, prNumber),
      withTimeout(
        () => octokit.rest.pulls.get({ owner, repo, pull_number: prNumber }),
        30_000,
        "fetchPullRequest",
      ),
    ]);
    diff = fetchedDiff;
    // Trim to what the pipeline actually uses (drops heavy `patch` payloads before caching)
    files = (fetchedFiles ?? []).map((f: { filename: string; status: string; additions?: number; deletions?: number }) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions ?? 0,
      deletions: f.deletions ?? 0,
    }));
    prTitle = prMeta?.data?.title?.trim() || "";
    prBody = (prMeta?.data?.body || "").trim().slice(0, 2000);
    prCommits = prMeta?.data?.commits ?? null;
    prBaseRef = prMeta?.data?.base?.ref ?? "";
    prHeadRef = prMeta?.data?.head?.ref ?? "";
  }

  const changedFiles = files
    .map((f) => f.filename)
    .filter((f) => /\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|css|scss|html|sql|json|yaml|yml|toml|md)$/i.test(f));
  const changedFilesSet = new Set(changedFiles.map((file) => normalizeFilePath(file)));
  const diffContext = parseChangedDiffContext(diff);

  let contextChunks: string[] = cachedContextChunks ?? [];

  if (cachedContextChunks === null && changedFiles.length > 0) {
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

        // Symbol-grounded retrieval: embeddings alone miss exact call sites. For
        // every declaration touched by the diff, ask the index for that symbol.
        const changedSymbols = extractDeclaredSymbols(diff);

        const symbolQueries = changedSymbols.map((symbol) =>
          queryCodebase(`${symbol} call sites and usages`, repoRecord.id, 2),
        );

        const [fileResults, extraResults, symbolResults] = await Promise.all([
          Promise.all(fileQueries),
          Promise.all(extraQueries),
          Promise.all(symbolQueries),
        ]);

        if (changedSymbols.length > 0) {
          logger.info("Symbol-grounded RAG queries", { owner, repo, prNumber, symbols: changedSymbols });
        }

        const flattened = [...fileResults.flat(), ...extraResults.flat(), ...symbolResults.flat()];
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

  if (reviewContextCacheKey && cachedContext === null) {
    await setCachedReviewContext(reviewContextCacheKey, {
      diff,
      files,
      prTitle,
      prBody,
      prCommits,
      prBaseRef,
      prHeadRef,
      contextChunks,
    });
  }

  const prContextBlock = prTitle
    ? `## Pull Request Context:
Title: ${prTitle}
Base: ${prBaseRef} → Head: ${prHeadRef}${prCommits != null ? `\nCommits: ${prCommits}` : ""}
${prBody ? `\nDescription:\n${prBody}` : ""}`
    : "";

  const reviewContext = buildReviewContext({
    diff,
    files,
    diffCharsBudget,
    ignoreGlobs: (repositorySettings?.reviewIgnoreGlobs ?? "")
      .split(/[\n,]/g)
      .map((glob) => glob.trim())
      .filter(Boolean)
      .slice(0, 25),
  });
  const excludedFilesBlock = reviewContext.excludedFiles.length > 0
    ? `## Excluded from deep review (binary/lockfile/cache-like - do NOT review their contents, but mention them briefly in the summary):
${reviewContext.excludedFiles.map((f) => `- ${f}`).join("\n")}
`
    : "";

  const { extractStaticHints, formatStaticHintsForPrompt } = await import("@/module/ai/lib/static-hints");
  const staticHintsBlock = formatStaticHintsForPrompt(extractStaticHints(diff));

  const userPrompt = `Review this pull request in the repository ${owner}/${repo}.

${contextChunks.length > 0 ? `
## Relevant Codebase Context:
${contextChunks.join("\n\n---\n\n")}
` : ""}
${prContextBlock}
${excludedFilesBlock}
${reviewContext.statBlock}
${staticHintsBlock}

## Pull Request Diff:
\`\`\`diff
${reviewContext.diffForPrompt}
\`\`\`

${files.length > 0 ? `
## Changed Files:
${files.map((f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`).join("\n")}
` : ""}

Provide a structured review with specific issues, suggestions, and an overall score.`;

  logger.info("Generating AI review", { owner, repo, prNumber, contextChunks: contextChunks.length, provider: selectedProvider, model: normalizedSelectedModel });

  const effectiveSystemPrompt = FINDING_V2 ? `${systemPrompt}\n${V2_SYSTEM_ADDENDUM}` : systemPrompt;
  const activeReviewSchema = FINDING_V2 ? CodeReviewV2Schema : CodeReviewSchema;

  const runReviewGeneration = async (modelToUse: LanguageModel, maxOutputTokens = REVIEW_MAX_TOKENS): Promise<{ object: CodeReview }> => {
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const isRateLimit = (msg: string) => /429|rate[- ]?limit|quota|overloaded|resource[_ ]?exhausted/i.test(msg);
    const logUsage = (stage: string, usage: Record<string, unknown> | undefined) => {
      if (!usage) return;
      const inputTokens = Number(usage.inputTokens ?? usage.promptTokens ?? 0);
      const outputTokens = Number(usage.outputTokens ?? usage.completionTokens ?? 0);
      logger.info("Model usage", { owner, repo, prNumber, stage, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens });
    };
    try {
      const result = await generateObject({
        model: modelToUse,
        system: effectiveSystemPrompt,
        prompt: userPrompt,
        schema: activeReviewSchema,
        maxOutputTokens,
      });
      logUsage("generate", result.usage as Record<string, unknown> | undefined);
      // v2 payloads are normalized (severity downgrade etc.) in sanitizeReviewOutput
      return { object: result.object as unknown as CodeReview };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      // One lightweight retry on provider rate-limit/quota before giving up on the model.
      if (isRateLimit(errorMessage)) {
        logger.warn("Provider rate-limited; retrying once after backoff", { owner, repo, prNumber, model: normalizedSelectedModel });
        try {
          await sleep(2000);
          const retryResult = await generateObject({
            model: modelToUse,
            system: effectiveSystemPrompt,
            prompt: userPrompt,
            schema: activeReviewSchema,
            maxOutputTokens,
          });
          logUsage("generate-retry", retryResult.usage as Record<string, unknown> | undefined);
          return { object: retryResult.object as unknown as CodeReview };
        } catch (retryErr) {
          logger.warn("Rate-limit retry also failed; falling back to JSON text path", {
            owner,
            repo,
            prNumber,
            error: retryErr instanceof Error ? retryErr.message : String(retryErr),
          });
        }
      }
      logger.warn("Structured output failed, retrying with JSON text", {
        owner,
        repo,
        prNumber,
        error: errorMessage,
      });

      const { text } = await generateText({
        model: modelToUse,
        system: effectiveSystemPrompt,
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
    try {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    // Free-provider failover chain: free tiers are small (Gemini ~20 req/day).
    // If the primary failed for ANY reason, try Groq's free pool next, then let
    // the remaining recovery tree handle whatever is left (OpenRouter free, etc.).
    let chainRecovered = false;
    {
      const groqKey = userApiKey || process.env.GROQ_API_KEY;
      if (groqKey && selectedProvider !== "groq") {
        const groqClient = createOpenAI({ apiKey: groqKey, baseURL: "https://api.groq.com/openai/v1" });
        for (const candidate of ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]) {
          try {
            ({ object } = await runReviewGeneration(groqClient(candidate)));
            reviewerProvider = "groq";
            reviewerModel = candidate;
            chainRecovered = true;
            logger.info("Free-provider failover succeeded", {
              owner, repo, prNumber, provider: "groq", model: candidate, originalProvider: selectedProvider,
            });
            break;
          } catch (chainErr) {
            logger.warn("Groq free-chain candidate failed", {
              owner, repo, prNumber, candidate,
              error: chainErr instanceof Error ? chainErr.message : String(chainErr),
            });
          }
        }
      }
    }

    if (!chainRecovered) {
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
      const reducedRun = async (modelToUse: LanguageModel, maxOutputTokens = REVIEW_MAX_TOKENS): Promise<{ object: CodeReview }> => {
        try {
          const result = await generateObject({ model: modelToUse, system: effectiveSystemPrompt, prompt: reducedPrompt, schema: activeReviewSchema, maxOutputTokens });
          return { object: result.object as unknown as CodeReview };
        } catch (err2) {
          const { text } = await generateText({ model: modelToUse, system: effectiveSystemPrompt, prompt: reducedPrompt, maxOutputTokens });
          return { object: parseReviewJson(text) as CodeReview };
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

        // Fallback: the safe OpenRouter auto-router only. No ranking is applied -
        // if the configured model fails, auto routes to whatever live model is available.
        const orderedFallbacks: string[] = ["openrouter/auto"];

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

        for (const fallbackModel of orderedFallbacks) {
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

      const groqFallbackModels = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"];
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
      object = buildOfflineReview(owner, repo, prNumber, errorMessage);
    }
    }
    } catch (fallbackErr) {
      // All recovery attempts themselves threw - synthesize the guaranteed review
      const reason = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      logger.warn("All provider fallbacks exhausted; synthesizing best-effort review", {
        owner,
        repo,
        prNumber,
        selectedProvider,
        selectedModel: reviewerModel,
        reason,
      });
      object = buildOfflineReview(owner, repo, prNumber, reason);
      reviewerProvider = "internal";
      reviewerModel = "offline-fallback";
    }
  }

  let normalizedReview = sanitizeReviewOutput(object, {
    diffContext,
    changedFiles: changedFilesSet.size > 0 ? changedFilesSet : diffContext.changedFiles,
    reviewModes,
    contextText: reviewContext.diffForPrompt,
  });

  // Conditional specialist passes (security / data-integrity / concurrency) run
  // only when the diff touches risky surface area, BEFORE the judge pass so the
  // judge can filter them like any other finding.
  try {
    const { runSpecialistPasses } = await import("@/module/ai/lib/specialists");
    const specialistIssues = await runSpecialistPasses({
      owner,
      repo,
      prNumber,
      changedFiles: [...changedFilesSet],
      diffText: diff,
      contextText: reviewContext.diffForPrompt,
      prTitle,
    });
    if (specialistIssues.length > 0) {
      normalizedReview = sanitizeReviewOutput(
        {
          ...normalizedReview,
          issues: [
            ...specialistIssues,
            ...normalizedReview.issues,
          ] as typeof normalizedReview.issues,
        },
        {
          diffContext,
          changedFiles: changedFilesSet.size > 0 ? changedFilesSet : diffContext.changedFiles,
          reviewModes,
          contextText: reviewContext.diffForPrompt,
        },
      );
      logger.info("Specialist findings merged", { owner, repo, prNumber, merged: normalizedReview.issues.length });
    }
  } catch (specialistErr) {
    logger.warn("Specialist analysis failed; continuing with primary review", {
      owner,
      repo,
      prNumber,
      error: specialistErr instanceof Error ? specialistErr.message : String(specialistErr),
    });
  }

  const sanitizeParams = {
    diffContext,
    changedFiles: changedFilesSet.size > 0 ? changedFilesSet : diffContext.changedFiles,
    reviewModes,
    contextText: reviewContext.diffForPrompt,
  };
  const judgedReview = await judgeReviewIfPossible(normalizedReview, {
    owner,
    repo,
    prNumber,
    prContextBlock,
    diffExcerpt: reviewContext.diffForPrompt.slice(0, 12000),
    statBlock: reviewContext.statBlock,
  });
  normalizedReview = sanitizeReviewOutput(judgedReview, sanitizeParams);

  if (reviewContext.excludedFiles.length > 0) {
    const mentionsExcluded = reviewContext.excludedFiles.some((f) =>
      normalizedReview.summary.includes(f) || normalizedReview.summary.includes(f.split("/").pop() || f),
    );
    if (!mentionsExcluded) {
      const listed = reviewContext.excludedFiles.slice(0, 10).join(", ");
      const extra = reviewContext.excludedFiles.length > 10 ? ` and ${reviewContext.excludedFiles.length - 10} more` : "";
      normalizedReview = {
        ...normalizedReview,
        summary: `${normalizedReview.summary} Also changed (not deeply reviewed): ${listed}${extra}.`,
      };
    }
  }

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
