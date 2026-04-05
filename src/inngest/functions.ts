
import { prisma } from "@/lib/prisma";
import { inngest } from "./client";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { getRepoFileContents } from "@/module/github/github";
import { indexCodebase, deleteRepoVectors } from "@/module/ai/lib/rag";
import { createLogger } from "@/lib/logger";
import { Prisma } from "@prisma/client";
import { Octokit } from "octokit";
import { checkPerPRReviewLimit, checkUsageLimit, incrementUsage, isSpecialLimitlessUser } from "@/lib/billing.server";
import { getFailureHumorScenario, getHumorLines, getSuccessHumorScenario } from "@/lib/review-humor";

const l = createLogger("inngest-functions");
const MAX_FREE_PLAN_PR_COMMITS = 3;
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

            l.warn("Transient Prisma error, retrying", {
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

function isTransientReviewError(message: string): boolean {
    return /(timeout|timed out|econnreset|etimedout|503|502|504|rate limit|temporar|try again)/i.test(message);
}

async function getPreferredOctokit(owner: string, repo: string, userId: string): Promise<Octokit> {
    try {
        const { getInstallationOctokit } = await import("@/lib/github-app");
        return await getInstallationOctokit(owner, repo);
    } catch (err) {
        l.warn("GitHub App auth unavailable; using user OAuth token", {
            owner,
            repo,
            userId,
            error: (err as Error).message,
        });

        const account = await prisma.account.findFirst({
            where: {
                userId,
                providerId: "github",
            },
            select: { accessToken: true },
        });

        if (!account?.accessToken) {
            throw new Error("No usable GitHub credentials found for this repository.");
        }

        return new Octokit({ auth: account.accessToken });
    }
}

export const indexRepo = inngest.createFunction(
{id: "index-repo"},
{event: "repository.connected"},

async ({ event, step }) => {
    const { owner, repo, userId, fullReindex } = event.data;

    const files = await step.run("Fetch repository files", async ()=>{
        const account = await prisma.account.findFirst({ 
            where: { 
              userId: userId,
              providerId: "github"
            },
        })
        if(!account?.accessToken){
          throw new Error("no Github access token found");
        }

        return await getRepoFileContents(account.accessToken, repo, owner);
    })

    const result = await step.run("index-codebase", async ()=>{
        const dbRepo = await prisma.repository.findFirst({
            where: { owner, name: repo, userId },
        });
        if (!dbRepo) {
            throw new Error(`Repository ${owner}/${repo} not found in database`);
        }

        const repoId = dbRepo.id;

        if (fullReindex) {
            await deleteRepoVectors(repoId);
        }

        return await indexCodebase(repoId, files);
    })

    await step.run("Update repository status", async ()=>{
        await prisma.repository.updateMany({
            where: { owner, name: repo, userId },
            data: { updatedAt: new Date() },
        });
        l.info("Repository indexed successfully", { owner, repo, userId, indexed: result.indexed });
    })
});


export const reindexRepo = inngest.createFunction(
{id: "reindex-repo"},
{event: "repository.reindex"},

async ({ event, step }) => {
    const { owner, repo, userId } = event.data;

    await step.run("Delete old vectors", async ()=>{
        const dbRepo = await prisma.repository.findFirst({
            where: { owner, name: repo, userId },
        });
        if (dbRepo) {
            await deleteRepoVectors(dbRepo.id);
        }
    });

    const files = await step.run("Fetch repository files", async ()=>{
        const account = await prisma.account.findFirst({ 
            where: { 
              userId: userId,
              providerId: "github"
            },
        })
        if(!account?.accessToken){
          throw new Error("no Github access token found");
        }
        return await getRepoFileContents(account.accessToken, repo, owner);
    })

    await step.run("index-codebase", async ()=>{
        const dbRepo = await prisma.repository.findFirst({
            where: { owner, name: repo, userId },
        });
        if (!dbRepo) {
            throw new Error(`Repository ${owner}/${repo} not found in database`);
        }
        return await indexCodebase(dbRepo.id, files);
    })
});


export const processPREvent = inngest.createFunction(
{id: "process-pr-event", retries: 1},
{event: "pull_request.opened"},

async ({ event, step }) => {
    const { owner, repo, prNumber, userId, action } = event.data;
    let progressCommentId: number | null = null;

    try {

    const usage = await step.run("Check monthly usage limit", async ()=>{
        return await checkUsageLimit(userId);
    });

    if (!usage.allowed) {
        await step.run("Post monthly limit comment", async ()=>{
            const octokit = await getPreferredOctokit(owner, repo, userId);
            await octokit.rest.issues.createComment({
                owner,
                repo,
                issue_number: prNumber,
                body: [
                    "## CodeTurtle AI Review",
                    "",
                    "I could not start the review because your monthly review quota is used up.",
                    `Usage this month: ${usage.used}/${usage.limit}`,
                    "",
                    "Please upgrade your plan or wait until your monthly quota resets.",
                    ...(await getHumorLines("quota-limit", { used: usage.used, limit: usage.limit })),
                ].join("\n"),
            });
        });
        l.warn("Monthly review limit reached; skipping PR review", { owner, repo, prNumber, userId, action, usage });
        return { skipped: true, reason: "monthly_limit_reached", usage };
    }

    const perPrUsage = await step.run("Check per-PR usage limit", async ()=>{
        return await checkPerPRReviewLimit({ userId, owner, repo, prNumber });
    });

    if (!perPrUsage.allowed) {
        await step.run("Post per-PR limit comment", async ()=>{
            const octokit = await getPreferredOctokit(owner, repo, userId);
            await octokit.rest.issues.createComment({
                owner,
                repo,
                issue_number: prNumber,
                body: [
                    "## CodeTurtle AI Review",
                    "",
                    "I could not start the review because this PR has reached the free plan limit.",
                    `This PR usage this month: ${perPrUsage.used}/${perPrUsage.limit}`,
                    "",
                    "Free plan allows up to 5 automated reviews per PR each month.",
                    ...(await getHumorLines("quota-limit", { used: perPrUsage.used, limit: perPrUsage.limit })),
                ].join("\n"),
            });
        });
        l.warn("Per-PR review limit reached; skipping PR review", { owner, repo, prNumber, userId, action, perPrUsage });
        return { skipped: true, reason: "per_pr_limit_reached", perPrUsage };
    }

    const commitPolicy = await step.run("Check free plan commit policy", async ()=>{
        const specialLimitless = await isSpecialLimitlessUser(userId);
        if (specialLimitless) {
            return { allowed: true, commits: 0 };
        }

        const subscription = await prisma.subscription.findUnique({
            where: { userId },
            select: { plan: true },
        });

        if ((subscription?.plan || "free") !== "free") {
            return { allowed: true, commits: 0 };
        }

        const octokit = await getPreferredOctokit(owner, repo, userId);
        const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
        const commits = pr.commits || 0;
        return { allowed: commits <= MAX_FREE_PLAN_PR_COMMITS, commits };
    });

    if (!commitPolicy.allowed) {
        await step.run("Post free plan commit policy comment", async ()=>{
            const octokit = await getPreferredOctokit(owner, repo, userId);
            await octokit.rest.issues.createComment({
                owner,
                repo,
                issue_number: prNumber,
                body: [
                    "## CodeTurtle AI Review",
                    "",
                    `This PR has ${commitPolicy.commits} commits.`,
                    `Free plan supports automated reviews for PRs with up to ${MAX_FREE_PLAN_PR_COMMITS} commits.`,
                    "Please split this PR into smaller changes or upgrade your plan to continue.",
                    "",
                    "Review was not generated for this PR.",
                    ...(await getHumorLines("quota-limit")),
                ].join("\n"),
            });
        });

        l.warn("Free plan commit policy blocked PR review", {
            owner,
            repo,
            prNumber,
            userId,
            action,
            commits: commitPolicy.commits,
        });

        return { skipped: true, reason: "free_commit_limit_exceeded", commits: commitPolicy.commits };
    }

    progressCommentId = await step.run("Post review in progress comment", async ()=>{
        const octokit = await getPreferredOctokit(owner, repo, userId);

        const { data: comment } = await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: prNumber,
            body: [
                "## CodeTurtle AI Review",
                "",
                "Review in progress...",
                "",
                "Please wait while I analyze the changes.",
                ...(await getHumorLines("in-progress")),
            ].join("\n"),
        });
        l.info("Posted review in progress comment", { owner, repo, prNumber, commentId: comment.id });
        return comment.id;
    })

    const review = await step.run("Generate PR review", async ()=>{
        const { generateCodeReview } = await import("@/module/ai/lib/review");
        return await generateCodeReview({ owner, repo, prNumber, userId });
    })

    await step.run("Store review", async ()=>{
        const dbRepo = await withPrismaRetry("load-repository-for-store", () =>
            prisma.repository.findFirst({
                where: { owner, name: repo, userId },
            }),
        );
        if (!dbRepo) {
            throw new Error(`Repository ${owner}/${repo} is not connected for user ${userId}.`);
        }
        await withPrismaRetry("create-code-review", () =>
            prisma.codeReview.create({
                data: {
                    userId,
                    owner,
                    repo,
                    prNumber,
                    repositoryId: dbRepo.id,
                    summary: review.summary,
                    files: {
                        issues: review.issues,
                        suggestions: review.suggestions,
                        overallScore: review.overallScore,
                        positives: review.positives,
                        architectureNotes: review.architectureNotes,
                    } satisfies Prisma.InputJsonValue,
                    status: "completed",
                },
            }),
        );
        await withPrismaRetry("increment-usage", () => incrementUsage(userId));
        l.info("PR review stored", { owner, repo, prNumber, score: review.overallScore });
    })

    await step.run("Post review to GitHub PR", async ()=>{
        const octokit = await getPreferredOctokit(owner, repo, userId);

        const reviewComments: Array<{ path: string; line: number; body: string }> = [];

        for (const issue of review.issues) {
            if (issue.file && issue.line) {
                reviewComments.push({
                    path: issue.file,
                    line: issue.line,
                    body: `**${issue.title}** (${issue.severity})\n\n${issue.description}\n\n**Suggestion:** ${issue.suggestion}`,
                });
            }
        }

        const reviewEvent = review.overallScore < 5 ? "REQUEST_CHANGES" : "COMMENT";
        const successScenario = getSuccessHumorScenario(review.overallScore, review.issues.length);
        const successHumorLines = await getHumorLines(successScenario, {
            score: review.overallScore,
            issuesCount: review.issues.length,
        });

        const prBody = [
            `## CodeTurtle AI Review — Score: ${review.overallScore}/10`,
            "",
            `Reviewer model: ${review.reviewerProvider}/${review.reviewerModel}`,
            "",
            review.summary,
            ...successHumorLines,
            "",
            review.issues.length > 0 ? `### Issues Found (${review.issues.length})\n${review.issues.map((i) => `- **${i.title}** in \`${i.file}\` (${i.severity})`).join("\n")}` : "",
            "",
            review.suggestions.length > 0 ? `### Suggestions (${review.suggestions.length})\n${review.suggestions.map((s) => `- ${s.title} in \`${s.file}\``).join("\n")}` : "",
            "",
            review.positives.length > 0 ? `### Positives\n${review.positives.map((p) => `- ${p}`).join("\n")}` : "",
            "",
            review.architectureNotes ? `### Architecture Notes\n${review.architectureNotes}` : "",
        ].filter(Boolean).join("\n");

        if (reviewComments.length > 0) {
            try {
                await octokit.rest.pulls.createReview({
                    owner,
                    repo,
                    pull_number: prNumber,
                    body: prBody,
                    event: reviewEvent,
                    comments: reviewComments,
                });
                l.info("PR review posted to GitHub", { owner, repo, prNumber, comments: reviewComments.length, event: reviewEvent });
            } catch (reviewErr) {
                const reviewErrorMessage = reviewErr instanceof Error ? reviewErr.message : "Unknown error";
                const reviewErrorStatus = (reviewErr as { status?: number } | undefined)?.status;
                const lineResolutionError =
                    reviewErrorStatus === 422 && /line could not be resolved|unprocessable entity/i.test(reviewErrorMessage);

                if (!lineResolutionError) {
                    throw reviewErr;
                }

                l.warn("Inline review comments could not be resolved; posting summary review only", {
                    owner,
                    repo,
                    prNumber,
                    commentsAttempted: reviewComments.length,
                    error: reviewErrorMessage,
                });

                await octokit.rest.pulls.createReview({
                    owner,
                    repo,
                    pull_number: prNumber,
                    body: [
                        prBody,
                        "",
                        "_Note: Inline comments were skipped because GitHub could not resolve one or more line positions in the current PR diff._",
                    ].join("\n"),
                    event: reviewEvent,
                });
            }
        } else {
            await octokit.rest.issues.createComment({
                owner,
                repo,
                issue_number: prNumber,
                body: prBody,
            });
            l.info("PR review posted as issue comment (no line-specific comments)", { owner, repo, prNumber });
        }

        if (progressCommentId) {
            await octokit.rest.issues.updateComment({
                owner,
                repo,
                comment_id: progressCommentId,
                body: [
                    "## CodeTurtle AI Review",
                    "",
                    `Review complete using ${review.reviewerProvider}/${review.reviewerModel}. See the review above for details.`,
                    ...successHumorLines,
                ].join("\n"),
            });
            l.info("Updated progress comment to complete", { owner, repo, prNumber, commentId: progressCommentId });
        }
    })

    return review;
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        l.error("PR review processing failed", err as Error, { owner, repo, prNumber, userId, action });

        await step.run("Post user-friendly failure comment", async ()=>{
            try {
                const octokit = await getPreferredOctokit(owner, repo, userId);
                let userSettings: { aiProvider: string; aiModel: string } | null = null;
                try {
                    userSettings = await withPrismaRetry("load-user-settings-for-failure-comment", () =>
                        prisma.user.findUnique({
                            where: { id: userId },
                            select: { aiProvider: true, aiModel: true },
                        }),
                    );
                } catch (settingsErr) {
                    l.warn("Could not load user settings for failure comment", {
                        owner,
                        repo,
                        prNumber,
                        userId,
                        error: settingsErr instanceof Error ? settingsErr.message : "Unknown error",
                    });
                }

                const configuredProvider = userSettings?.aiProvider || "google";
                const rawConfiguredModel = userSettings?.aiModel || "gemini-2.5-flash";
                const configuredModel =
                    configuredProvider === "openrouter" && rawConfiguredModel === "moonshotai/kimi-k2:free"
                        ? "moonshotai/kimi-k2"
                        : rawConfiguredModel;

                const helpText = /bad credentials|401|unauthorized/i.test(errorMessage)
                    ? "Likely cause: GitHub authorization has expired. Please reconnect your GitHub account in settings and try again."
                    : /decommissioned|no longer supported|unknown model|model .* not found|unsupported model/i.test(errorMessage)
                    ? "Likely cause: selected model is deprecated/unsupported by provider. Pick a newer model in settings and retry."
                    : /no endpoints found/i.test(errorMessage)
                    ? "Likely cause: the selected model is currently unavailable on its provider. Please switch model in settings (for OpenRouter, use openrouter/auto or qwen/qwen3.6-plus:free) and retry."
                    : /api key is missing|loadapikeyerror|pass it using the 'apiKey' parameter/i.test(errorMessage)
                    ? "Likely cause: the selected provider API key is missing or invalid. Add a valid key for this provider in settings, or switch to Google Gemini."
                    : /rate limit|429/i.test(errorMessage)
                    ? "Likely cause: provider rate limit. Please retry in a few minutes."
                    : /provider returned error|ai_apicallerror/i.test(errorMessage)
                    ? "Likely cause: provider-side model routing failure. Please switch model in settings (recommended: openrouter/auto) and retry."
                    : "Please retry in a few minutes. If this keeps happening, contact support with this PR link.";
                const failureHumorLines = await getHumorLines(getFailureHumorScenario(errorMessage));
                const body = [
                    "## CodeTurtle AI Review",
                    "",
                    "Sorry, I could not complete this automated review.",
                    `Configured reviewer model: ${configuredProvider}/${configuredModel}`,
                    helpText,
                    ...failureHumorLines,
                ].join("\n");

                if (progressCommentId) {
                    await octokit.rest.issues.updateComment({
                        owner,
                        repo,
                        comment_id: progressCommentId,
                        body,
                    });
                } else {
                    await octokit.rest.issues.createComment({
                        owner,
                        repo,
                        issue_number: prNumber,
                        body,
                    });
                }
            } catch (commentErr) {
                l.error("Failed to post failure comment", commentErr as Error, { owner, repo, prNumber, userId });
            }
        });

        if (isTransientReviewError(errorMessage)) {
            throw err;
        }

        return {
            failed: true,
            retried: false,
            reason: errorMessage,
        };
    }
});


export const testFunction = inngest.createFunction(
  { id: "test-function" },
  { event: "test.event" },
  async ({ event, step }) => {
    console.log("Test function executed with event data:", event.data);
  }
);

export const processPRMention = inngest.createFunction(
  { id: "process-pr-mention", retries: 1 },
  { event: "pull_request.mention" },
  async ({ event, step }) => {
    const { owner, repo, prNumber, userId, commentId, commentBody, senderLogin } = event.data as {
      owner: string;
      repo: string;
      prNumber: number;
      userId: string;
      commentId: number;
      commentBody: string;
      senderLogin: string;
    };

    await step.run("Reply to @codeturtle mention", async () => {
      const octokit = await getPreferredOctokit(owner, repo, userId);
      const cleanedPrompt = commentBody
        .replace(/@(?:codeturtle|codeturtle-bot(?:\[bot\])?)(?=\s|$|[.,!?])/gi, "")
        .trim();

      const userPrompt =
        cleanedPrompt.length > 0
          ? cleanedPrompt
          : "User mentioned @codeturtle without additional text. Ask what they need help with.";

      const mentionTone = /thanks|thank you|love|great|awesome|nice|helpful/i.test(userPrompt)
        ? "positive"
        : /lol|lmao|haha|funny|joke/i.test(userPrompt)
        ? "funny"
        : /stupid|idiot|useless|bad bot|hate|worst|shit|sucks|dont like|don't like/i.test(userPrompt)
        ? "frustrated"
        : "neutral";

      const fallbackResponseByTone: Record<string, string> = {
        positive: "Appreciate you. If you want, I can re-check specific files before you merge.",
        funny: "Fair one. Drop the exact file or comment thread and I will focus there.",
        frustrated: "Fair feedback. Tell me the top 1-2 points you disagree with and I will re-check those first.",
        neutral: "Got you. Share what part you want me to focus on and I will help directly.",
      };

      let responseText = "";
      try {
        const { text } = await generateText({
          model: google("gemini-2.5-flash"),
          system:
            `You are CodeTurtle, an AI PR assistant. Match this tone: ${mentionTone}. Keep it casual, short (2-4 lines), and actionable. Avoid corporate wording.`,
          prompt: `Repository: ${owner}/${repo}\nPR: #${prNumber}\nUser message: ${userPrompt}`,
          temperature: 0.4,
          maxOutputTokens: 300,
        });
        responseText = text.trim();
      } catch (err) {
        l.warn("Mention response generation failed; using fallback", {
          owner,
          repo,
          prNumber,
          commentId,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }

      const mentionScenario = mentionTone === "positive"
        ? "success-clean"
        : mentionTone === "frustrated"
        ? "success-critical"
        : "success-warning";
      const humorLines = await getHumorLines(mentionScenario);

      const body = [
        "## CodeTurtle Reply",
        "",
        responseText || fallbackResponseByTone[mentionTone],
        ...humorLines,
      ].join("\n");

      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      });

      l.info("Posted @codeturtle mention reply", { owner, repo, prNumber, commentId, senderLogin });
    });
  },
);
