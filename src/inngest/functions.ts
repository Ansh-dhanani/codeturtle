
import { prisma } from "@/lib/prisma";
import { inngest } from "./client";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { getRepoFileContentsFromOctokit } from "@/module/github/github";
import { indexCodebase, deleteRepoVectors } from "@/module/ai/lib/rag";
import { createLogger } from "@/lib/logger";
import { Prisma } from "@prisma/client";
import { Octokit } from "octokit";
import { checkPerPRReviewLimit, checkUsageLimit, incrementUsage, isSpecialLimitlessUser } from "@/lib/billing.server";
import { getFailureHumorScenario, getHumorLines, getSuccessHumorScenario } from "@/lib/review-humor";
import {
    DEFAULT_REPO_BEHAVIOR_SETTINGS,
    getMentionModesInstruction,
    normalizeCustomPrompt,
    normalizeRepoReviewModes,
    normalizeRepoReviewStyle,
    type RepoBehaviorSettings,
} from "@/module/repository/lib/settings";

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

async function getRepositoryBehaviorSettings(owner: string, repo: string, userId: string): Promise<RepoBehaviorSettings> {
    const repository = await withPrismaRetry("load-repository-behavior-settings", () =>
        prisma.repository.findFirst({
            where: { owner, name: repo, userId },
            select: { reviewStyle: true, memesEnabled: true, customPrompt: true },
        }),
    );

    if (!repository) {
        return DEFAULT_REPO_BEHAVIOR_SETTINGS;
    }

    return {
        reviewModes: normalizeRepoReviewModes(repository.reviewStyle),
        reviewStyle: normalizeRepoReviewStyle(repository.reviewStyle),
        memesEnabled: repository.memesEnabled ?? DEFAULT_REPO_BEHAVIOR_SETTINGS.memesEnabled,
        customPrompt: normalizeCustomPrompt(repository.customPrompt, 2000),
    };
}

type ReviewSuggestion = {
    file: string;
    title: string;
    description?: string;
    codeBefore?: string;
    codeAfter?: string;
};

function extractReviewSuggestions(files: Prisma.JsonValue | null): ReviewSuggestion[] {
    if (!files || typeof files !== "object" || Array.isArray(files)) {
        return [];
    }

    const record = files as Record<string, unknown>;
    const rawSuggestions = record.suggestions;
    if (!Array.isArray(rawSuggestions)) {
        return [];
    }

    return rawSuggestions
        .map((entry): ReviewSuggestion | null => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
            const item = entry as Record<string, unknown>;
            if (typeof item.file !== "string" || typeof item.title !== "string") return null;

            return {
                file: item.file,
                title: item.title,
                description: typeof item.description === "string" ? item.description : undefined,
                codeBefore: typeof item.codeBefore === "string" ? item.codeBefore : undefined,
                codeAfter: typeof item.codeAfter === "string" ? item.codeAfter : undefined,
            };
        })
        .filter((entry): entry is ReviewSuggestion => Boolean(entry));
}

function isCreateFixPrCommand(message: string): boolean {
    const normalized = message.toLowerCase();
    return /(make|create|open|raise)\s+(a\s+)?pr\b/.test(normalized)
        && /(suggestion|suggestions|fix|fixes|changes)/.test(normalized);
}

async function createPRFromLatestSuggestions(params: {
    owner: string;
    repo: string;
    prNumber: number;
    userId: string;
    octokit: Octokit;
}): Promise<{ body: string; success: boolean; scenario: "success-clean" | "success-warning" | "success-critical" }> {
    const { owner, repo, prNumber, userId, octokit } = params;

    const latestReview = await withPrismaRetry("load-latest-review-for-pr-command", () =>
        prisma.codeReview.findFirst({
            where: {
                userId,
                owner,
                repo,
                prNumber,
                status: "completed",
            },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                sha: true,
                files: true,
                createdAt: true,
            },
        }),
    );

    if (!latestReview) {
        return {
            success: false,
            scenario: "success-warning",
            body: "I could not find a completed CodeTurtle review for this PR yet. Run a review first, then ask me again.",
        };
    }

    const suggestions = extractReviewSuggestions(latestReview.files as Prisma.JsonValue | null).filter(
        (item) => Boolean(item.codeAfter),
    );

    if (suggestions.length === 0) {
        return {
            success: false,
            scenario: "success-warning",
            body: "I found the latest review, but it has no `codeAfter` suggestion blocks I can safely apply.",
        };
    }

    const { data: pr } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
    });

    const repoFullName = `${owner}/${repo}`.toLowerCase();
    const headRepoFullName = pr.head.repo?.full_name?.toLowerCase() || "";
    if (headRepoFullName !== repoFullName) {
        return {
            success: false,
            scenario: "success-warning",
            body:
                "This PR comes from a fork branch, and I cannot safely open a fix PR against that head branch with current permissions.",
        };
    }

    if (latestReview.sha && pr.head.sha && latestReview.sha !== pr.head.sha) {
        return {
            success: false,
            scenario: "success-warning",
            body: [
                "Conflict check failed: the PR has new commits since the last review.",
                `Last reviewed SHA: \`${latestReview.sha}\``,
                `Current head SHA: \`${pr.head.sha}\``,
                "Please trigger a fresh review, then ask me to create the PR again.",
            ].join("\n"),
        };
    }

    const baseBranch = pr.head.ref;
    const branchName = `codeturtle/suggestions-${prNumber}-${Date.now().toString().slice(-6)}`;

    await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: pr.head.sha,
    });

    const applied: string[] = [];
    const conflicts: string[] = [];

    for (const suggestion of suggestions) {
        if (!suggestion.codeAfter) continue;

        let existingSha: string | undefined;
        let currentContent = "";
        let fileExists = false;

        try {
            const { data: existingFile } = await octokit.rest.repos.getContent({
                owner,
                repo,
                path: suggestion.file,
                ref: branchName,
            });

            if (!Array.isArray(existingFile) && existingFile.type === "file") {
                fileExists = true;
                existingSha = existingFile.sha;
                currentContent = Buffer.from(existingFile.content || "", "base64").toString("utf-8");
            } else {
                conflicts.push(`${suggestion.file}: path is not a regular file.`);
                continue;
            }
        } catch (err) {
            const status = (err as { status?: number }).status;
            if (status !== 404) {
                conflicts.push(`${suggestion.file}: could not load current content.`);
                continue;
            }
        }

        if (fileExists && suggestion.codeBefore && !currentContent.includes(suggestion.codeBefore)) {
            conflicts.push(`${suggestion.file}: expected previous snippet was not found.`);
            continue;
        }

        if (fileExists && currentContent.trim() === suggestion.codeAfter.trim()) {
            conflicts.push(`${suggestion.file}: already matches suggested change.`);
            continue;
        }

        await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: suggestion.file,
            message: `codeturtle: apply suggestion - ${suggestion.title}`,
            content: Buffer.from(suggestion.codeAfter).toString("base64"),
            branch: branchName,
            ...(existingSha ? { sha: existingSha } : {}),
        });

        applied.push(`${suggestion.file}: ${suggestion.title}`);
    }

    if (applied.length === 0) {
        await octokit.rest.git.deleteRef({
            owner,
            repo,
            ref: `heads/${branchName}`,
        });

        return {
            success: false,
            scenario: "success-warning",
            body: [
                "I could not apply any suggestion cleanly after conflict checks.",
                conflicts.length > 0 ? `Conflicts:\n${conflicts.map((line) => `- ${line}`).join("\n")}` : "",
            ]
                .filter(Boolean)
                .join("\n"),
        };
    }

    const { data: newPr } = await octokit.rest.pulls.create({
        owner,
        repo,
        title: `CodeTurtle: apply suggestions for #${prNumber}`,
        head: branchName,
        base: baseBranch,
        body: [
            `Created from CodeTurtle suggestions on PR #${prNumber}.`,
            "",
            `Applied suggestions (${applied.length}):`,
            ...applied.map((line) => `- ${line}`),
            "",
            conflicts.length > 0 ? `Skipped due to conflicts (${conflicts.length}):` : "",
            ...conflicts.map((line) => `- ${line}`),
        ]
            .filter(Boolean)
            .join("\n"),
    });

    return {
        success: true,
        scenario: conflicts.length > 0 ? "success-warning" : "success-clean",
        body: [
            `Done. I created a fix PR from suggestions: ${newPr.html_url}`,
            `Base branch: \`${baseBranch}\``,
            `Applied: ${applied.length}`,
            conflicts.length > 0 ? `Skipped due to conflicts: ${conflicts.length}` : "No conflicts detected.",
        ].join("\n"),
    };
}

export const indexRepo = inngest.createFunction(
{id: "index-repo"},
{event: "repository.connected"},

async ({ event, step }) => {
    const { owner, repo, userId, fullReindex } = event.data;

    const files = await step.run("Fetch repository files", async ()=>{
        const octokit = await getPreferredOctokit(owner, repo, userId);
        return await getRepoFileContentsFromOctokit(octokit, repo, owner);
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
        const octokit = await getPreferredOctokit(owner, repo, userId);
        return await getRepoFileContentsFromOctokit(octokit, repo, owner);
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
    const { owner, repo, prNumber, userId, action, headSha } = event.data as {
        owner: string;
        repo: string;
        prNumber: number;
        userId: string;
        action: string;
        headSha?: string;
    };
    let progressCommentId: number | null = null;
    let processingReviewId: string | null = null;
    let behaviorSettings: RepoBehaviorSettings = DEFAULT_REPO_BEHAVIOR_SETTINGS;
    const humorDedupeKey = `review:${owner}/${repo}#${prNumber}`;

    try {
    behaviorSettings = await step.run("Load repository behavior settings", async () => {
        return getRepositoryBehaviorSettings(owner, repo, userId);
    });

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
                    ...(await getHumorLines("quota-limit", { used: usage.used, limit: usage.limit }, { enabled: behaviorSettings.memesEnabled, dedupeKey: humorDedupeKey })),
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
                    ...(await getHumorLines("quota-limit", { used: perPrUsage.used, limit: perPrUsage.limit }, { enabled: behaviorSettings.memesEnabled, dedupeKey: humorDedupeKey })),
                ].join("\n"),
            });
        });
        l.warn("Per-PR review limit reached; skipping PR review", { owner, repo, prNumber, userId, action, perPrUsage });
        return { skipped: true, reason: "per_pr_limit_reached", perPrUsage };
    }

    const commitPolicy = await step.run("Check free plan commit policy", async ()=>{
        const specialLimitless = await isSpecialLimitlessUser(userId);
        if (specialLimitless) {
            return { allowed: true, commits: 0, headSha: headSha || null };
        }

        const subscription = await prisma.subscription.findUnique({
            where: { userId },
            select: { plan: true },
        });

        if ((subscription?.plan || "free") !== "free") {
            return { allowed: true, commits: 0, headSha: headSha || null };
        }

        const octokit = await getPreferredOctokit(owner, repo, userId);
        const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
        const commits = pr.commits || 0;
        return { allowed: commits <= MAX_FREE_PLAN_PR_COMMITS, commits, headSha: pr.head.sha || null };
    });

    let effectiveHeadSha = headSha || commitPolicy.headSha || undefined;
    if (!effectiveHeadSha) {
        effectiveHeadSha = await step.run("Load PR head SHA", async () => {
            const octokit = await getPreferredOctokit(owner, repo, userId);
            const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
            return pr.head.sha ?? undefined;
        });
    }

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
                    ...(await getHumorLines("quota-limit", undefined, { enabled: behaviorSettings.memesEnabled, dedupeKey: humorDedupeKey })),
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

    if (effectiveHeadSha) {
        const existingCompletedReviewForSha = await step.run("Check completed duplicate review for same head SHA", async () => {
            return withPrismaRetry("find-completed-duplicate-review-by-sha", () =>
                prisma.codeReview.findFirst({
                    where: {
                        userId,
                        owner,
                        repo,
                        prNumber,
                        sha: effectiveHeadSha,
                        status: "completed",
                    },
                    select: { id: true },
                }),
            );
        });

        if (existingCompletedReviewForSha) {
            l.info("Skipping duplicate review for same PR head SHA", {
                owner,
                repo,
                prNumber,
                userId,
                headSha: effectiveHeadSha,
                existingReviewId: existingCompletedReviewForSha.id,
            });
            return { skipped: true, reason: "already_reviewed_sha", headSha: effectiveHeadSha };
        }

        const activeCutoff = new Date(Date.now() - 30 * 60 * 1000);
        const inFlightReviewForSha = await step.run("Check in-flight duplicate review for same head SHA", async () => {
            return withPrismaRetry("find-inflight-duplicate-review-by-sha", () =>
                prisma.codeReview.findFirst({
                    where: {
                        userId,
                        owner,
                        repo,
                        prNumber,
                        sha: effectiveHeadSha,
                        status: { in: ["pending", "processing"] },
                        createdAt: { gte: activeCutoff },
                    },
                    select: { id: true, status: true },
                }),
            );
        });

        if (inFlightReviewForSha) {
            l.info("Skipping duplicate review because an in-flight review already exists for SHA", {
                owner,
                repo,
                prNumber,
                userId,
                headSha: effectiveHeadSha,
                existingReviewId: inFlightReviewForSha.id,
                status: inFlightReviewForSha.status,
            });
            return { skipped: true, reason: "review_in_flight_for_sha", headSha: effectiveHeadSha };
        }
    }

    processingReviewId = await step.run("Create processing review lock", async () => {
        const dbRepo = await withPrismaRetry("load-repository-for-processing-lock", () =>
            prisma.repository.findFirst({
                where: { owner, name: repo, userId },
                select: { id: true },
            }),
        );
        if (!dbRepo) {
            throw new Error(`Repository ${owner}/${repo} is not connected for user ${userId}.`);
        }

        const created = await withPrismaRetry("create-processing-code-review", () =>
            prisma.codeReview.create({
                data: {
                    userId,
                    owner,
                    repo,
                    prNumber,
                    repositoryId: dbRepo.id,
                    sha: effectiveHeadSha,
                    status: "processing",
                    summary: "Review in progress...",
                },
                select: { id: true },
            }),
        );
        return created.id;
    });

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
                ...(await getHumorLines("in-progress", undefined, { enabled: behaviorSettings.memesEnabled, dedupeKey: humorDedupeKey })),
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
        if (processingReviewId) {
            const lockId = processingReviewId;
            await withPrismaRetry("update-processing-code-review", () =>
                prisma.codeReview.update({
                    where: { id: lockId },
                    data: {
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
        } else {
            const dbRepo = await withPrismaRetry("load-repository-for-store", () =>
                prisma.repository.findFirst({
                    where: { owner, name: repo, userId },
                    select: { id: true },
                }),
            );
            if (!dbRepo) {
                throw new Error(`Repository ${owner}/${repo} is not connected for user ${userId}.`);
            }
            await withPrismaRetry("create-code-review-without-lock", () =>
                prisma.codeReview.create({
                    data: {
                        userId,
                        owner,
                        repo,
                        prNumber,
                        repositoryId: dbRepo.id,
                        sha: effectiveHeadSha,
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
        }
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
        }, { enabled: behaviorSettings.memesEnabled, dedupeKey: humorDedupeKey });

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

        if (processingReviewId) {
            const lockId = processingReviewId;
            await step.run("Mark processing review failed", async () => {
                await withPrismaRetry("update-processing-review-failed", () =>
                    prisma.codeReview.updateMany({
                        where: { id: lockId, status: { in: ["pending", "processing"] } },
                        data: {
                            status: "failed",
                            summary: `Review failed: ${errorMessage.slice(0, 300)}`,
                        },
                    }),
                );
            });
        }

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
                const failureHumor = await getHumorLines(
                    getFailureHumorScenario(errorMessage),
                    undefined,
                    { enabled: behaviorSettings.memesEnabled, dedupeKey: humorDedupeKey },
                );
                const body = [
                    "## CodeTurtle AI Review",
                    "",
                    "Sorry, I could not complete this automated review.",
                    `Configured reviewer model: ${configuredProvider}/${configuredModel}`,
                    helpText,
                    ...failureHumor,
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
  async ({ event }) => {
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
    const humorDedupeKey = `mention:${owner}/${repo}#${prNumber}`;

    const behaviorSettings = await step.run("Load mention behavior settings", async () => {
      return getRepositoryBehaviorSettings(owner, repo, userId);
    });

    await step.run("Reply to @codeturtle mention", async () => {
      const octokit = await getPreferredOctokit(owner, repo, userId);
      const cleanedPrompt = commentBody
        .replace(/@(?:codeturtle|codeturtle-bot(?:\[bot\])?)(?=\s|$|[.,!?])/gi, "")
        .trim();

      const userPrompt =
        cleanedPrompt.length > 0
          ? cleanedPrompt
          : "User mentioned @codeturtle without additional text. Ask what they need help with.";

      if (isCreateFixPrCommand(userPrompt)) {
        let commandResult: Awaited<ReturnType<typeof createPRFromLatestSuggestions>>;
        try {
          commandResult = await createPRFromLatestSuggestions({
            owner,
            repo,
            prNumber,
            userId,
            octokit,
          });
        } catch (err) {
          l.warn("PR-from-suggestions command failed", {
            owner,
            repo,
            prNumber,
            commentId,
            error: err instanceof Error ? err.message : "Unknown error",
          });
          commandResult = {
            success: false,
            scenario: "success-critical",
            body: "I tried creating the PR from suggestions, but the operation failed. Please retry in a moment.",
          };
        }

        const commandHumorLines = await getHumorLines(
          commandResult.scenario,
          undefined,
          { enabled: behaviorSettings.memesEnabled, dedupeKey: humorDedupeKey },
        );

        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body: [
            "## CodeTurtle Reply",
            "",
            commandResult.body,
            ...commandHumorLines,
          ].join("\n"),
        });

        l.info("Handled @codeturtle PR creation command", {
          owner,
          repo,
          prNumber,
          commentId,
          senderLogin,
          success: commandResult.success,
        });
        return;
      }

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
            `You are CodeTurtle, an AI PR assistant. Match this tone: ${mentionTone}. ${getMentionModesInstruction(behaviorSettings.reviewModes)} Keep it casual, short (2-4 lines), and actionable. Avoid corporate wording.`,
          prompt: [
            `Repository: ${owner}/${repo}`,
            `PR: #${prNumber}`,
            `User message: ${userPrompt}`,
            behaviorSettings.customPrompt
              ? `Repository custom instruction: ${behaviorSettings.customPrompt}`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
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
      const humorLines = await getHumorLines(
        mentionScenario,
        undefined,
        { enabled: behaviorSettings.memesEnabled, dedupeKey: humorDedupeKey },
      );

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
