import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { Octokit } from "octokit";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { queryCodebase } from "./rag";
import { logger } from "@/lib/logger";

const ReviewIssueSchema = z.object({
  severity: z.enum(["critical", "warning", "info"]),
  title: z.string(),
  description: z.string(),
  file: z.string(),
  line: z.number().optional(),
  suggestion: z.string(),
});

const ReviewSuggestionSchema = z.object({
  title: z.string(),
  description: z.string(),
  file: z.string(),
  codeBefore: z.string().optional(),
  codeAfter: z.string().optional(),
});

const CodeReviewSchema = z.object({
  summary: z.string(),
  overallScore: z.number().min(0).max(10),
  issues: z.array(ReviewIssueSchema),
  suggestions: z.array(ReviewSuggestionSchema),
  positives: z.array(z.string()),
  architectureNotes: z.string().optional(),
});

type CodeReview = z.infer<typeof CodeReviewSchema>;

const SYSTEM_PROMPT = `You are a senior software engineer conducting a thorough code review.

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

async function getPRDiff(token: string, owner: string, repo: string, prNumber: number): Promise<string> {
  const octokit = new Octokit({ auth: token });

  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  if (!pr.diff_url) {
    throw new Error("No diff URL available for this PR");
  }

  const diffResponse = await fetch(pr.diff_url, {
    headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3.diff" },
  });
  return await diffResponse.text();
}

async function getPRFiles(token: string, owner: string, repo: string, prNumber: number) {
  const octokit = new Octokit({ auth: token });

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
}): Promise<CodeReview> {
  const { owner, repo, prNumber, userId, model, provider } = params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiProvider: true, aiModel: true, aiApiKey: true },
  });

  const selectedProvider = provider || user?.aiProvider || "google";
  const selectedModel = model || user?.aiModel || "gemini-2.5-flash";
  const userApiKey = user?.aiApiKey;

  const account = await prisma.account.findFirst({
    where: { userId, providerId: "github" },
  });

  if (!account?.accessToken) {
    throw new Error("No GitHub access token found");
  }

  const token = account.accessToken;

  logger.info("Fetching PR data for review", { owner, repo, prNumber });

  const [diff, files] = await Promise.all([
    getPRDiff(token, owner, repo, prNumber),
    getPRFiles(token, owner, repo, prNumber),
  ]);

  const changedFiles = files
    .map((f) => f.filename)
    .filter((f) => /\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|css|scss|html|sql|json|yaml|yml|toml|md)$/i.test(f));

  let contextChunks: string[] = [];

  if (changedFiles.length > 0) {
    try {
      const repoRecord = await prisma.repository.findFirst({
        where: { owner, name: repo },
      });

      if (repoRecord) {
        const queries = changedFiles.slice(0, 5).map(async (file) => {
          return queryCodebase(`Show me the code in ${file}`, repoRecord.id, 3);
        });
        const results = await Promise.all(queries);
        contextChunks = results.flat().map((r) => `File: ${r.path}\n${r.content}`);
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
${diff.slice(0, 50000)}
\`\`\`

${files.length > 0 ? `
## Changed Files:
${files.map((f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`).join("\n")}
` : ""}

Provide a structured review with specific issues, suggestions, and an overall score.`;

  logger.info("Generating AI review", { owner, repo, prNumber, contextChunks: contextChunks.length, provider: selectedProvider, model: selectedModel });

  let aiModel;
  if (selectedProvider === "openai") {
    const openaiClient = userApiKey ? createOpenAI({ apiKey: userApiKey }) : openai;
    aiModel = openaiClient(selectedModel);
  } else if (selectedProvider === "anthropic") {
    const anthropicClient = userApiKey ? createAnthropic({ apiKey: userApiKey }) : anthropic;
    aiModel = anthropicClient(selectedModel);
  } else {
    aiModel = google(selectedModel);
  }

  const { object } = await generateObject({
    model: aiModel,
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    schema: CodeReviewSchema,
  });

  logger.info("AI review generated", {
    owner,
    repo,
    prNumber,
    score: object.overallScore,
    issues: object.issues.length,
    suggestions: object.suggestions.length,
  });

  return object;
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

  const { object } = await generateObject({
    model: google("gemini-2.5-flash"),
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    schema: CodeReviewSchema,
  });

  return object;
}
