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
type CodeReviewWithReviewer = CodeReview & {
  reviewerProvider: string;
  reviewerModel: string;
};

const REVIEW_MAX_TOKENS = 4096;
const REVIEW_LOW_CREDIT_MAX_TOKENS = 1200;

const PRISMA_MAX_RETRIES = 3;

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

  const selectedProvider = provider || user?.aiProvider || "google";
  const selectedModel = model || user?.aiModel || "gemini-2.5-flash";
  const normalizedSelectedModel =
    selectedProvider === "openrouter" && selectedModel === "moonshotai/kimi-k2:free"
      ? "moonshotai/kimi-k2"
      : selectedModel;
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

  logger.info("Fetching PR data for review", { owner, repo, prNumber });

  const [diff, files] = await Promise.all([
    getPRDiff(octokit, owner, repo, prNumber),
    getPRFiles(octokit, owner, repo, prNumber),
  ]);

  const changedFiles = files
    .map((f) => f.filename)
    .filter((f) => /\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|css|scss|html|sql|json|yaml|yml|toml|md)$/i.test(f));

  let contextChunks: string[] = [];

  if (changedFiles.length > 0) {
    try {
      const repoRecord = await withPrismaRetry("load-repository-record", () =>
        prisma.repository.findFirst({
          where: { owner, name: repo },
        }),
      );

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

  logger.info("Generating AI review", { owner, repo, prNumber, contextChunks: contextChunks.length, provider: selectedProvider, model: normalizedSelectedModel });

  const runReviewGeneration = async (modelToUse: any, maxOutputTokens = REVIEW_MAX_TOKENS) => {
    return generateObject({
      model: modelToUse,
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      schema: CodeReviewSchema,
      maxOutputTokens,
    });
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

    if (selectedProvider === "openrouter" && (noEndpointError || insufficientCreditsError || providerReturnedError)) {
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

  logger.info("AI review generated", {
    owner,
    repo,
    prNumber,
    score: object.overallScore,
    issues: object.issues.length,
    suggestions: object.suggestions.length,
  });

  return {
    ...object,
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

  const { object } = await generateObject({
    model: google("gemini-2.5-flash"),
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    schema: CodeReviewSchema,
    maxOutputTokens: REVIEW_MAX_TOKENS,
  });

  return object;
}
