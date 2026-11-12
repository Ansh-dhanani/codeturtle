
import { prisma } from "@/lib/prisma";
import { inngest } from "./client";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { getRepoFileContentsFromOctokit } from "@/module/github/github";
import { indexCodebase, deleteRepoVectors, queryCodebase } from "@/module/ai/lib/rag";
import { createLogger } from "@/lib/logger";
import { withTimeout } from "@/lib/with-timeout";
import { Prisma } from "@prisma/client";
import { Octokit } from "octokit";
import { checkPerPRReviewLimit, checkUsageLimit, incrementUsage, isSpecialLimitlessUser } from "@/lib/billing.server";
import { getHumorLines, getSuccessHumorScenario } from "@/lib/review-humor";

type HumorScenario =
    | "success-clean"
    | "success-warning"
    | "success-critical"
    | "failure-auth"
    | "failure-model"
    | "failure-rate-limit"
    | "failure-generic"
    | "in-progress"
    | "quota-limit";
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
const MAX_FREE_PLAN_PR_FILES = 100;
const PRISMA_MAX_RETRIES = 3;

const BILLING_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "") + "/billing";
const UPGRADE_CTA = `\n\n**[Upgrade to Pro ($4/mo) for 100 reviews/mo on managed keys - unlimited with your own API key →](${BILLING_URL})**`;

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

async function buildProgressBody(
    status: string,
    behaviorSettings: RepoBehaviorSettings,
    humorDedupeKey: string,
    existingGifUrl: string | null,
    context?: { owner?: string; repo?: string; prNumber?: number; baseBranch?: string; headBranch?: string; headSha?: string; runId?: string; settingsPath?: string },
): Promise<{ body: string; gifUrl: string | null }> {    let gifUrl = existingGifUrl;

    // Only generate meme on first call (when we don't have one yet)
    if (!gifUrl) {
        try {
            const humorLines = await getHumorLines(
                "in-progress",
                undefined,
                {
                    enabled: behaviorSettings.memesEnabled,
                    dedupeKey: humorDedupeKey,
                    reuseLastMeme: false,
                    reuseLastQuip: false,
                },
            );

            const gifLine = humorLines.find((line) => line.startsWith("![meme-"));
            if (gifLine) {
                const match = gifLine.match(/\((https?:\/\/[^)]+)\)/);
                if (match) {
                    gifUrl = match[1];
                }
            }
        } catch (humorErr) {
            l.warn("Meme generation failed; continuing without meme", {
                humorDedupeKey,
                error: humorErr instanceof Error ? humorErr.message : "Unknown error",
            });
        }
    }

    const runId =
        context?.runId ||
        `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const reviewProfile = [
        behaviorSettings.reviewModes?.includes("professional")
            ? "PROFESSIONAL"
            : behaviorSettings.reviewModes?.includes("short")
                ? "SHORT"
                : "BALANCED",
    ].join("");

    const appBase = (process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
    const settingsUrl = context?.settingsPath
        ? `${appBase}${context.settingsPath}`
        : `${appBase}/repositories`;

    const contextRows = [
        context?.owner && context?.repo ? `**Repository** · \`${context.owner}/${context.repo}\`` : null,
        context?.baseBranch && context?.headBranch
            ? `**Branch** · \`${context.headBranch}\` → \`${context.baseBranch}\``
            : null,
        context?.headSha ? `**Commit** · \`${context.headSha.slice(0, 7)}\`` : null,
        context?.prNumber ? `**PR** · #${context.prNumber}` : null,
        `**Review profile** · ${reviewProfile}`,
        "**Layers** · diff compression · Pinecone RAG · judge pass",
        settingsUrl ? `**Settings** · [Configure this repository](${settingsUrl})` : null,
    ].filter(Boolean);

    const runConfig = [
        "<details>",
        '<summary><strong>⚙️ Run configuration</strong></summary>',
        "",
        ...contextRows.map((row) => `- ${row}`),
        `- **Run ID** · \`${runId}\``,
        "",
        "</details>",
    ].join("\n");

    const lines = [
        "<!-- codeturtle-review-progress -->",
        "## 🐢 CodeTurtle is reviewing this PR",
        "",
        "<details open>",
        "<summary><strong>🟡 In progress</strong></summary>",
        "",
        `**Status** · ${status.replace(/^Status:\s*/i, "")}`,
        "",
        gifUrl ? `![meme-in-progress](${gifUrl})\n` : "",
        "</details>",
        "",
        runConfig,
        "",
        "---",
        "",
        "*🧠 CodeTurtle runs a full-repo context pass - cloning, indexing, reading your diff, then judging what's actually worth flagging.*",
    ];

    return { body: lines.filter((l) => l !== undefined).join("\n"), gifUrl };
}

async function updateProgressComment(params: {
    owner: string;
    repo: string;
    prNumber: number;
    userId: string;
    commentId: number | null;
    status: string;
    behaviorSettings: RepoBehaviorSettings;
    humorDedupeKey: string;
    progressGifUrl: string | null;
    runId?: string;
    headSha?: string;
    baseBranch?: string;
    headBranch?: string;
}): Promise<void> {
    const { owner, repo, prNumber, userId, commentId, status, behaviorSettings, humorDedupeKey, progressGifUrl, runId, headSha, baseBranch, headBranch } = params;
    if (!commentId) return;
    let settingsPath: string | undefined;
    try {
        const dbRepo = await prisma.repository.findFirst({
            where: { owner, name: repo, userId },
            select: { id: true },
        });
        if (dbRepo?.id) settingsPath = `/repositories/${dbRepo.id}`;
    } catch {
        // fall back to the plain /repositories link
    }
    try {
        const octokit = await getPreferredOctokit(owner, repo, userId);
        const { body } = await buildProgressBody(status, behaviorSettings, humorDedupeKey, progressGifUrl, { owner, repo, prNumber, headSha, baseBranch, headBranch, runId, settingsPath });
        await octokit.rest.issues.updateComment({
            owner,
            repo,
            comment_id: commentId,
            body,
        });
        l.info("Updated review progress comment", { owner, repo, prNumber, commentId, status });
    } catch (progressErr) {
        l.warn("Failed to update progress comment; continuing without it", {
            owner, repo, prNumber, commentId, status,
            error: progressErr instanceof Error ? progressErr.message : "Unknown error",
        });
    }
}

async function getPreferredOctokit(owner: string, repo: string, userId: string): Promise<Octokit> {
    try {
        const { getInstallationOctokit } = await import("@/lib/github-app");
        return await getInstallationOctokit(owner, repo);
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(
            `GitHub App auth failed for ${owner}/${repo}: ${reason}. ` +
            "Install the CodeTurtle-bot app on this repository (https://github.com/apps/codeturtle-bot) " +
            "and ensure GITHUB_APP_PRIVATE_KEY (full PEM) and GITHUB_APP_ID are set in Vercel. " +
            "App auth is required so reviews post as the bot and can REQUEST_CHANGES on your PRs.",
        );
    }
}

async function getRepositoryBehaviorSettings(owner: string, repo: string, userId: string): Promise<RepoBehaviorSettings> {
    const repository = await withPrismaRetry("load-repository-behavior-settings", () =>
        prisma.repository.findFirst({
            where: { owner, name: repo, userId },
            select: { reviewStyle: true, memesEnabled: true, customPrompt: true, reviewMode: true },
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
        reviewMode: (repository.reviewMode as "auto" | "ask" | undefined) ?? DEFAULT_REPO_BEHAVIOR_SETTINGS.reviewMode,
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
    { id: "index-repo", triggers: [{ event: "repository.connected" }] },

    async ({ event, step }) => {
        const { owner, repo, userId, fullReindex } = event.data;

        const files = await step.run("Fetch repository files", async () => {
            const octokit = await getPreferredOctokit(owner, repo, userId);
            return await getRepoFileContentsFromOctokit(octokit, repo, owner);
        })

        const result = await step.run("index-codebase", async () => {
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

        await step.run("Update repository status", async () => {
            await prisma.repository.updateMany({
                where: { owner, name: repo, userId },
                data: { updatedAt: new Date() },
            });
            l.info("Repository indexed successfully", { owner, repo, userId });
        })
    });


export const reindexRepo = inngest.createFunction(
    { id: "reindex-repo", triggers: [{ event: "repository.reindex" }] },

    async ({ event, step }) => {
        const { owner, repo, userId } = event.data;

        await step.run("Delete old vectors", async () => {
            const dbRepo = await prisma.repository.findFirst({
                where: { owner, name: repo, userId },
            });
            if (dbRepo) {
                await deleteRepoVectors(dbRepo.id);
            }
        });

        const files = await step.run("Fetch repository files", async () => {
            const octokit = await getPreferredOctokit(owner, repo, userId);
            return await getRepoFileContentsFromOctokit(octokit, repo, owner);
        })

        await step.run("index-codebase", async () => {
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
    {
        id: "process-pr-event",
        retries: 3,
        // Supersede stale runs for the same PR (force-push storms must not fan
        // out multiple full reviews) and serialize the survivors.
        concurrency: [{ key: "event.data.owner + '/' + event.data.repo + '#' + string(event.data.prNumber)", limit: 1 }],
        singleton: { key: "event.data.owner + '/' + event.data.repo + '#' + string(event.data.prNumber)", mode: "cancel" },
        triggers: [{ event: "pull_request.opened" }],
    },

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
        let checkRunId: number | null = null;
        let behaviorSettings: RepoBehaviorSettings = DEFAULT_REPO_BEHAVIOR_SETTINGS;
        const reviewRunId = `review_${owner}_${repo}_${prNumber}_${Date.now().toString(36).slice(-4)}`;
        const humorDedupeKey = `review:${owner}/${repo}#${prNumber}`;

        try {
            behaviorSettings = await step.run("Load repository behavior settings", async () => {
                return getRepositoryBehaviorSettings(owner, repo, userId);
            });

            // Ask mode post-check bypass: user manually confirmed, run the review.
            if (behaviorSettings.reviewMode === "ask" && action !== "review_confirmed") {
                await step.run("Post awaiting-confirmation comment", async () => {
                    const octokit = await getPreferredOctokit(owner, repo, userId);
                    const headShaShort = headSha?.slice(0, 7);
                    await octokit.rest.issues.createComment({
                        owner,
                        repo,
                        issue_number: prNumber,
                        body: [
                            "## 🐢 CodeTurtle is waiting for your go-ahead",
                            "",
                            `I can review this PR on: <code>${headShaShort ?? "latest commit"}</code>`,
                            "",
                            "If you'd like a review, reply or edit this comment to check the box below - I'll get started right away.",
                            "",
                            "<details open>",
                            "<summary><strong>Want CodeTurtle to review this PR?</strong></summary>",
                            "",
                            "- [ ] ✅ **Yes, review this PR**",
                            "- [ ] 🚫 **Not now - skip CodeTurtle on this PR**",
                            "",
                            "_To change this permanently, open Settings → this repository → Review mode → Auto._",
                            "",
                            "</details>",
                        ].join("\n"),
                    });
                });
                l.info("Posted awaiting-confirmation comment; skipping auto-review (ask mode)", { owner, repo, prNumber, action, headSha });
                return { skipped: true, reason: "awaiting_confirmation", reviewMode: "ask" };
            }

            const usage = await step.run("Check monthly usage limit", async () => {
                return await checkUsageLimit(userId);
            });

            if (!usage.allowed) {
                await step.run("Post monthly limit comment", async () => {
                    const octokit = await getPreferredOctokit(owner, repo, userId);
                    await octokit.rest.issues.createComment({
                        owner,
                        repo,
                        issue_number: prNumber,
                        body: [
                            `Monthly quota reached: ${usage.used}/${usage.limit}. Please upgrade or wait for reset.`,
                            ...(await getHumorLines("quota-limit", { used: usage.used, limit: usage.limit }, { enabled: behaviorSettings.memesEnabled, dedupeKey: humorDedupeKey })),
                            UPGRADE_CTA,
                        ].join("\n"),
                    });
                });
                l.warn("Monthly review limit reached; skipping PR review", { owner, repo, prNumber, userId, action, usage });
                return { skipped: true, reason: "monthly_limit_reached", usage };
            }

            const perPrUsage = await step.run("Check per-PR usage limit", async () => {
                return await checkPerPRReviewLimit({ userId, owner, repo, prNumber });
            });

            if (!perPrUsage.allowed) {
                await step.run("Post per-PR limit comment", async () => {
                    const octokit = await getPreferredOctokit(owner, repo, userId);
                    await octokit.rest.issues.createComment({
                        owner,
                        repo,
                        issue_number: prNumber,
                        body: [
                            `Free plan limit: ${perPrUsage.used}/${perPrUsage.limit} reviews used this month.`,
                            ...(await getHumorLines("quota-limit", { used: perPrUsage.used, limit: perPrUsage.limit }, { enabled: behaviorSettings.memesEnabled, dedupeKey: humorDedupeKey })),
                            UPGRADE_CTA,
                        ].join("\n"),
                    });
                });
                l.warn("Per-PR review limit reached; skipping PR review", { owner, repo, prNumber, userId, action, perPrUsage });
                return { skipped: true, reason: "per_pr_limit_reached", perPrUsage };
            }

            const commitPolicy = await step.run("Check free plan commit policy", async () => {
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

            // Free plan: don't burn tokens on huge diffs. Large PRs are where
            // reviews produce noise anyway, so we bail out with pointers to Pro.
            const diffGuard = await step.run("Check diff size policy", async () => {
                const specialLimitless = await isSpecialLimitlessUser(userId);
                if (specialLimitless) {
                    return { allowed: true, changedFiles: 0 };
                }
                const subscription = await prisma.subscription.findUnique({
                    where: { userId },
                    select: { plan: true },
                });
                if ((subscription?.plan || "free") !== "free") {
                    return { allowed: true, changedFiles: 0 };
                }
                const octokit = await getPreferredOctokit(owner, repo, userId);
                const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
                const changedFiles = pr.changed_files ?? 0;
                return { allowed: changedFiles <= MAX_FREE_PLAN_PR_FILES, changedFiles };
            });

            if (!diffGuard.allowed) {
                await step.run("Post too-many-files comment", async () => {
                    const octokit = await getPreferredOctokit(owner, repo, userId);
                    await octokit.rest.issues.createComment({
                        owner,
                        repo,
                        issue_number: prNumber,
                        body: [
                            `This PR touches **${diffGuard.changedFiles} files** — over the Free plan limit of ${MAX_FREE_PLAN_PR_FILES}. Split it into smaller PRs, or go unlimited.`,
                            ...(await getHumorLines("quota-limit", undefined, { enabled: behaviorSettings.memesEnabled, dedupeKey: humorDedupeKey })),
                            UPGRADE_CTA,
                        ].join("\n"),
                    });
                });

                l.warn("PR exceeds free plan file limit; skipping review", {
                    owner,
                    repo,
                    prNumber,
                    userId,
                    action,
                    changedFiles: diffGuard.changedFiles,
                });
                return { skipped: true, reason: "too_many_files", changedFiles: diffGuard.changedFiles };
            }

            let effectiveHeadSha = headSha || commitPolicy.headSha || undefined;
            if (!effectiveHeadSha) {
                effectiveHeadSha = await step.run("Load PR head SHA", async () => {
                    const octokit = await getPreferredOctokit(owner, repo, userId);
                    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
                    return pr.head.sha ?? undefined;
                });
            }

            if (!commitPolicy.allowed) {
                await step.run("Post free plan commit policy comment", async () => {
                    const octokit = await getPreferredOctokit(owner, repo, userId);
                    await octokit.rest.issues.createComment({
                        owner,
                        repo,
                        issue_number: prNumber,
                        body: [
                            `${commitPolicy.commits} commits exceeds free plan limit (${MAX_FREE_PLAN_PR_COMMITS}). Split PR or upgrade.`,
                            ...(await getHumorLines("quota-limit", undefined, { enabled: behaviorSettings.memesEnabled, dedupeKey: humorDedupeKey })),
                            UPGRADE_CTA,
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

                try {
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
                } catch (createErr) {
                    // Unique index on (userId, owner, repo, prNumber, sha) is the final
                    // arbiter for idempotency. A P2002 means the review was already claimed.
                    const code = (createErr as { code?: string })?.code;
                    if (code === "P2002") {
                        l.info("Duplicate processing lock rejected by unique index", {
                            owner, repo, prNumber, userId, effectiveHeadSha,
                        });
                        return null;
                    }
                    throw createErr;
                }
            });

            // Create a GitHub Check Run so the review appears as a required status
            // on the PR head commit. INNGEST only blocks the won-process replay, not
            // the App identity - and the Checks API gives us the green/red/yellow icon.
            checkRunId = await step.run("Create GitHub check run", async () => {
                if (!effectiveHeadSha) return null;
                const octokit = await getPreferredOctokit(owner, repo, userId);
                try {
                    const { data: checkRun } = await octokit.rest.checks.create({
                        owner,
                        repo,
                        name: "CodeTurtle Review",
                        head_sha: effectiveHeadSha,
                        status: "in_progress",
                        started_at: new Date().toISOString(),
                        output: {
                            title: "🐢 CodeTurtle is reviewing",
                            summary: "Reading diff and connected repository to produce a repository-aware review.",
                        },
                    });
                    if (processingReviewId) {
                        await prisma.codeReview.update({
                            where: { id: processingReviewId },
                            data: { checkRunId: checkRun.id },
                        });
                    }
                    return checkRun.id;
                } catch (err) {
                    l.warn("Failed to create GitHub check run; review will post without check status", {
                        owner, repo, prNumber,
                        error: err instanceof Error ? err.message : "Unknown error",
                    });
                    return null;
                }
            });

            const progressGifUrl = await step.run("Post review in progress comment", async () => {
                const octokit = await getPreferredOctokit(owner, repo, userId);

                // Reuse an existing progress comment if one exists on this PR so
                // repeated runs don't pile up duplicate banners across re-opens/syncs.
                const existing = await octokit.rest.issues.listComments({
                    owner,
                    repo,
                    issue_number: prNumber,
                    per_page: 50,
                });
                const marker = "<!-- codeturtle-review-progress -->";
                const existingProgress = existing.data.find(
                    (c) => typeof c.body === "string" && c.body.includes(marker) && c.user?.type === "Bot",
                );

                // Generate initial comment with meme GIF
                const { body, gifUrl } = await buildProgressBody(
                    "Review in progress...",
                    behaviorSettings,
                    humorDedupeKey,
                    null,
                    { owner, repo, prNumber, headSha: headSha || effectiveHeadSha, runId: reviewRunId },
                );

                if (existingProgress) {
                    progressCommentId = existingProgress.id;
                    await octokit.rest.issues.updateComment({
                        owner,
                        repo,
                        comment_id: existingProgress.id,
                        body,
                    });
                    l.info("Reused existing review progress comment", { owner, repo, prNumber, commentId: existingProgress.id });
                    return gifUrl;
                }

                const { data: comment } = await octokit.rest.issues.createComment({
                    owner,
                    repo,
                    issue_number: prNumber,
                    body,
                });
                progressCommentId = comment.id;
                l.info("Posted review in progress comment", { owner, repo, prNumber, commentId: comment.id, gifUrl });
                return gifUrl;
            })

            await step.run("Update progress: fetch context", async () => {
                await updateProgressComment({
                    owner,
                    repo,
                    prNumber,
                    userId,
                    commentId: progressCommentId,
                    status: "Status: Fetching PR data and related code context...",
                    behaviorSettings,
                    humorDedupeKey,
                    progressGifUrl,
                    runId: reviewRunId,
                    headSha: headSha || effectiveHeadSha,
                });
            });

            await step.run("Update progress: generate review", async () => {
                await updateProgressComment({
                    owner,
                    repo,
                    prNumber,
                    userId,
                    commentId: progressCommentId,
                    status: "Status: Generating review...",
                    behaviorSettings,
                    humorDedupeKey,
                    progressGifUrl,
                    runId: reviewRunId,
                    headSha: headSha || effectiveHeadSha,
                });
            });

            const review = await step.run("Generate PR review", async () => {
                const { generateCodeReview } = await import("@/module/ai/lib/review");
                return await withTimeout(
                    () => generateCodeReview({ owner, repo, prNumber, userId, headSha: headSha || effectiveHeadSha }),
                    5 * 60 * 1000,
                    "generateCodeReview",
                );
            })

            await step.run("Update progress: review generated", async () => {
                await updateProgressComment({
                    owner,
                    repo,
                    prNumber,
                    userId,
                    commentId: progressCommentId,
                    status: "Status: Review generated - preparing to post to GitHub...",
                    behaviorSettings,
                    humorDedupeKey,
                    progressGifUrl,
                    runId: reviewRunId,
                    headSha: headSha || effectiveHeadSha,
                });
            });

            await step.run("Post review to GitHub PR", async () => {
                const octokit = await getPreferredOctokit(owner, repo, userId);

                await updateProgressComment({
                    owner,
                    repo,
                    prNumber,
                    userId,
                    commentId: progressCommentId,
                    status: "Status: Posting review to GitHub...",
                    behaviorSettings,
                    humorDedupeKey,
                    progressGifUrl,
                    runId: reviewRunId,
                    headSha: headSha || effectiveHeadSha,
                });

                const reviewComments: Array<{ path: string; line: number; body: string }> = [];

                for (const issue of review.issues) {
                    if (issue.file && issue.line) {
                        const feelsLikeCode =
                            /[;{}()\n=>]/.test(issue.suggestion) &&
                            issue.suggestion.trim().split("\n").length <= 40;

                        const hasDescription = issue.description && issue.description !== "No description provided.";
                        const body = [
                            `**${issue.severity === "critical" ? "🛑" : issue.severity === "warning" ? "⚠️" : "ℹ️"} ${issue.title}**`,
                            `**Severity:** ${issue.severity} · \`${issue.file}:L${issue.line}\``,
                            "",
                            hasDescription ? issue.description : "",
                            hasDescription ? "" : (issue.suggestion && issue.suggestion !== "No suggestion provided." ? issue.suggestion : ""),
                            "",
                            issue.suggestion && issue.suggestion !== "No suggestion provided." && hasDescription ? (
                                feelsLikeCode && issue.suggestion.trim().split("\n").length === 1
                                    ? [
                                          "**Suggested change:**",
                                          "```suggestion",
                                          issue.suggestion.trim(),
                                          "```",
                                      ].join("\n")
                                    : [
                                          "**Suggested fix:**",
                                          /[;{}()\n=>]|\b(const|let|var|function|return|import|from)\b/.test(issue.suggestion)
                                              ? ["```suggestion", issue.suggestion.trim(), "```"].join("\n")
                                              : "> " + issue.suggestion.trim().split("\n").join("\n> "),
                                      ].join("\n")
                            ) : "",
                        ]
                            .filter(Boolean)
                            .join("\n");

                        reviewComments.push({
                            path: issue.file,
                            line: issue.line,
                            body,
                        });
                    }
                }

                const hasCritical = review.issues.some((i) => i.severity === "critical");
                const reviewEvent = hasCritical || review.overallScore < 5 ? "REQUEST_CHANGES" : "COMMENT";
                const successScenario = getSuccessHumorScenario(review.overallScore, review.issues.length);
                let successHumorLines: string[] = [];
                try {
                    successHumorLines = await getHumorLines(successScenario, {
                        score: review.overallScore,
                        issuesCount: review.issues.length,
                    }, { enabled: behaviorSettings.memesEnabled, dedupeKey: humorDedupeKey });
                } catch (humorErr) {
                    l.warn("Success humor generation failed; posting review without humor", {
                        humorDedupeKey,
                        error: humorErr instanceof Error ? humorErr.message : "Unknown error",
                    });
                }

                const sevEmoji: Record<string, string> = { critical: "🛑", warning: "⚠️", info: "ℹ️" };
                const sevLabel: Record<string, string> = { critical: "Critical", warning: "Warning", info: "Info" };
                const sevColor: Record<string, string> = { critical: "critical", warning: "yellow/warning", info: "blue/info" };

                const section = (title: string, content: string, open = false) =>
                    `<details${open ? " open" : ""}>\n<summary><strong>${title}</strong></summary>\n\n${content}\n\n</details>`;

                const prBody = [
                    "## 🐢 CodeTurtle Review",
                    "",
                    "| | |",
                    "| :- | :- |",
                    `| **Score** | **${review.overallScore}/10** |`,
                    `| **Reviewer** | \`${review.reviewerProvider}/${review.reviewerModel}\` |`,
                    `| **Event** | ${reviewEvent === "REQUEST_CHANGES" ? "🔴 Changes Requested" : "🟢 Comment"} |`,
                    `| **Issues** | ${review.issues.length} |`,
                    `| **Suggestions** | ${review.suggestions.length} |`,
                    `| **Positives** | ${review.positives.length} |`,
                    "",
                    "### 📝 Summary",
                    "",
                    review.summary,
                    ...successHumorLines.map((line) => `\n${line}`),
                    "",
                    review.issues.length > 0
                        ? section(`🚨 Issues (${review.issues.length})`,
                            review.issues.map((i) => {
                                const icon = sevEmoji[i.severity] || "ℹ️";
                                const label = sevLabel[i.severity] || "Info";
                                const hasDescription = i.description && i.description !== "No description provided.";
                                const suggestionBlock =
                                    i.suggestion && i.suggestion !== "No suggestion provided." && hasDescription
                                        ? [
                                            "<details>",
                                            "<summary>Suggested change</summary>",
                                            "",
                                            /[;{}()\n=>]|\b(const|let|var|function|return|import|from)\b/.test(i.suggestion)
                                                ? ["```suggestion", i.suggestion.trim(), "```"].join("\n")
                                                : ["> " + i.suggestion.trim().split("\n").join("\n> ")].join("\n"),
                                            "",
                                            "</details>",
                                        ].join("\n")
                                        : "";
                                return [
                                    `#### ${icon} ${i.title} &nbsp;·&nbsp; \`${i.file}\`${i.line ? `:L${i.line}` : ""} &nbsp;·&nbsp; **${label}**`,
                                    "",
                                    hasDescription ? i.description : (i.suggestion && i.suggestion !== "No suggestion provided." ? i.suggestion : ""),
                                    "",
                                    suggestionBlock,
                                ].filter(Boolean).join("\n");
                            }).join("\n\n---\n\n"),
                        )
                        : "",
                    "",
                    review.suggestions.length > 0
                        ? section(`💡 Suggestions (${review.suggestions.length})`,
                            review.suggestions.map((s) => [
                                `#### ${s.title} &nbsp;·&nbsp; \`${s.file}\``,
                                "",
                                s.description,
                                s.codeAfter ? [
                                    "",
                                    "<details>",
                                    "<summary>Proposed change</summary>",
                                    "",
                                    "```diff",
                                    `-${(s.codeBefore ?? "").split("\n").join("\n-")}`,
                                    `+${s.codeAfter.split("\n").join("\n+")}`,
                                    "```",
                                    "",
                                    "</details>",
                                ].join("\n") : "",
                            ].filter(Boolean).join("\n")).join("\n\n---\n\n"),
                        )
                        : "",
                    "",
                    review.positives.length > 0
                        ? section(`🌟 Positives (${review.positives.length})`,
                            [
                                "",
                                ...review.positives.map((p) => `- ✅ ${p}`),
                            ].join("\n"),
                        )
                        : "",
                    "",
                    review.architectureNotes
                        ? section("🏗️ Architecture Notes", review.architectureNotes, true)
                        : "",
                    "",
                    review.diagram
                        ? section("🗺️ Data Flow Diagram", [
                            "```mermaid",
                            review.diagram.trim(),
                            "```",
                        ].join("\n"))
                        : "",
                    "",
                    "---",
                    "",
                    "💡 **Reply** with `@codeturtle` to ask follow-up questions, or ask me to generate a fix PR with actual applied changes.",
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

            })

            await step.run("Store review", async () => {
                // Resolve PR title/URL so the record carries accurate metadata
                // (shown in Analytics & the Reviews feed)
                let prTitle: string | null = null;
                let prUrl: string | null = null;
                try {
                    const octokit = await getPreferredOctokit(owner, repo, userId);
                    const { data: prMeta } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
                    prTitle = prMeta?.title?.trim() || null;
                    prUrl = prMeta?.html_url || null;
                } catch (prMetaErr) {
                    l.warn("Could not fetch PR metadata for storing; leaving title/url empty", {
                        owner, repo, prNumber,
                        error: prMetaErr instanceof Error ? prMetaErr.message : "Unknown error",
                    });
                }
                if (processingReviewId) {
                    const lockId = processingReviewId;
                    await withPrismaRetry("update-processing-code-review", () =>
                        prisma.codeReview.update({
                            where: { id: lockId },
                            data: {
                                summary: review.summary,
                                prTitle,
                                prUrl,
                                files: {
                                    issues: review.issues,
                                    suggestions: review.suggestions,
                                    overallScore: review.overallScore,
                                    positives: review.positives,
                                    architectureNotes: review.architectureNotes,
                                    diagram: review.diagram,
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
                                prTitle,
                                prUrl,
                                files: {
                                    issues: review.issues,
                                    suggestions: review.suggestions,
                                    overallScore: review.overallScore,
                                    positives: review.positives,
                                    architectureNotes: review.architectureNotes,
                                    diagram: review.diagram,
                                } satisfies Prisma.InputJsonValue,
                                status: "completed",
                            },
                        }),
                    );
                }
                await withPrismaRetry("increment-usage", () => incrementUsage(userId));
                l.info("PR review stored", { owner, repo, prNumber, score: review.overallScore });
            })

            // Mark the progress comment in a terminal state so it doesn't stay "In progress" forever
            await step.run("Mark progress comment complete", async () => {
                if (!progressCommentId) return;
                try {
                    const octokit = await getPreferredOctokit(owner, repo, userId);
                    const noFindings = review.issues.length === 0 && review.suggestions.length === 0;
                    const body = [
                        `## 🐢 CodeTurtle Review complete${noFindings ? " - empty review" : ""}`,
                        "",
                        `**Score:** **${review.overallScore}/10** &nbsp;·&nbsp; **${review.issues.length}** issue${review.issues.length === 1 ? "" : "s"} &nbsp;·&nbsp; **${review.suggestions.length}** suggestion${review.suggestions.length === 1 ? "" : "s"}`,
                        "",
                        noFindings
                            ? "The configured model selected nothing worth flagging. This is plausible on clean code, but suspicious on obviously bad code - consider switching to a stronger model in the PR settings."
                            : "See the full review above for details.",
                        "",
                        `<sub>Run · ${reviewRunId}</sub>`,
                    ].join("\n");
                    await octokit.rest.issues.updateComment({
                        owner,
                        repo,
                        comment_id: progressCommentId,
                        body,
                    });
                } catch (err) {
                    l.warn("Failed to mark progress comment complete", {
                        owner, repo, prNumber,
                        error: err instanceof Error ? err.message : "Unknown error",
                    });
                }
            });

            // Complete the GitHub check run with conclusion derived from the review.
            await step.run("Complete GitHub check run", async () => {
                if (!checkRunId) return;
                try {
                    const octokit = await getPreferredOctokit(owner, repo, userId);
                    const hasCritical = review.issues.some((i) => i.severity === "critical");
                    const conclusion: "success" | "neutral" | "action_required" | "failure" =
                        hasCritical && review.overallScore < 5 ? "failure"
                        : hasCritical ? "action_required"
                        : review.overallScore >= 7 ? "success"
                        : "neutral";

                    const annotations: Array<{
                        path: string;
                        start_line: number;
                        end_line: number;
                        annotation_level: "notice" | "warning" | "failure";
                        message: string;
                        title?: string;
                    }> = [];

                    for (const issue of review.issues.slice(0, 50)) {
                        const line = typeof issue.line === "number" ? Math.max(1, Math.trunc(issue.line)) : 1;
                        annotations.push({
                            path: issue.file || "unknown",
                            start_line: line,
                            end_line: line,
                            annotation_level: issue.severity === "critical" ? "failure" : issue.severity === "warning" ? "warning" : "notice",
                            title: issue.title.slice(0, 255),
                            message: (issue.description || issue.title).slice(0, 64000),
                        });
                    }

                    const tail = review.suggestions.slice(0, 25);
                    for (const suggestion of tail) {
                        annotations.push({
                            path: suggestion.file || "unknown",
                            start_line: 1,
                            end_line: 1,
                            annotation_level: "notice",
                            title: `Suggestion: ${suggestion.title}`.slice(0, 255),
                            message: suggestion.description.slice(0, 64000),
                        });
                    }

                    await octokit.rest.checks.update({
                        owner,
                        repo,
                        check_run_id: checkRunId,
                        status: "completed",
                        conclusion,
                        completed_at: new Date().toISOString(),
                        output: {
                            title: `🐢 CodeTurtle review: ${review.overallScore}/10${hasCritical ? " · critical issues" : ""}`,
                            summary: review.summary,
                            annotations,
                        },
                    });
                } catch (err) {
                    l.warn("Failed to complete GitHub check run", {
                        owner, repo, prNumber,
                        error: err instanceof Error ? err.message : "Unknown error",
                    });
                }
            });

            return review;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error";
            l.error("PR review processing failed", err as Error, { owner, repo, prNumber, userId, action });

            await step.run("Complete GitHub check run (failure)", async () => {
                if (!checkRunId) return;
                try {
                    const octokit = await getPreferredOctokit(owner, repo, userId);
                    await octokit.rest.checks.update({
                        owner,
                        repo,
                        check_run_id: checkRunId,
                        status: "completed",
                        conclusion: "failure",
                        completed_at: new Date().toISOString(),
                        output: {
                            title: "🐢 CodeTurtle review failed",
                            summary: `Review could not be completed: ${errorMessage.slice(0, 500)}`,
                        },
                    });
                } catch (checkErr) {
                    l.warn("Failed to complete GitHub check run (failure path)", {
                        owner, repo, prNumber,
                        error: checkErr instanceof Error ? checkErr.message : "Unknown error",
                    });
                }
            });

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

            await step.run("Post user-friendly failure comment", async () => {
                try {
                    const appBase = (process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
                    let settingsLink = `${appBase}/repositories`;
                    const octokit = await getPreferredOctokit(owner, repo, userId);
                    let resolvedProvider: string | null = null;
                    let resolvedModel: string | null = null;
                    try {
                        const repoSettings = await withPrismaRetry("load-repo-settings-for-failure-comment", () =>
                            prisma.repository.findFirst({
                                where: { owner, name: repo, userId },
                                select: { aiProvider: true, aiModel: true, id: true },
                            }),
                        );
                        resolvedProvider = repoSettings?.aiProvider || null;
                        resolvedModel = repoSettings?.aiModel || null;
                        if (repoSettings?.id) {
                            settingsLink = `${appBase}/repositories/${repoSettings.id}`;
                        }
                    } catch (repoSettingsErr) {
                        l.warn("Could not load repository settings for failure comment", {
                            owner, repo, prNumber, userId,
                            error: repoSettingsErr instanceof Error ? repoSettingsErr.message : "Unknown error",
                        });
                    }
                    try {
                        if (resolvedProvider === null || resolvedModel === null) {
                            const userSettings = await withPrismaRetry("load-user-settings-for-failure-comment", () =>
                                prisma.user.findUnique({
                                    where: { id: userId },
                                    select: { aiProvider: true, aiModel: true },
                                }),
                            );
                            const { getDefaultReviewModel } = await import("@/lib/ai-catalog");
                            const def = await getDefaultReviewModel();
                            resolvedProvider = resolvedProvider ?? userSettings?.aiProvider ?? def.provider;
                            resolvedModel = resolvedModel ?? userSettings?.aiModel ?? def.model;
                        }
                    } catch (userSettingsErr) {
                        l.warn("Could not load user settings for failure comment", {
                            owner, repo, prNumber, userId,
                            error: userSettingsErr instanceof Error ? userSettingsErr.message : "Unknown error",
                        });
                    }

                    const { getDefaultReviewModel } = await import("@/lib/ai-catalog");
                    const def = await getDefaultReviewModel();
                    const configuredProvider = resolvedProvider || def.provider;
                    const rawConfiguredModel = resolvedModel || def.model;
                    const configuredModel =
                        configuredProvider === "openrouter" && rawConfiguredModel === "moonshotai/kimi-k2:free"
                            ? "moonshotai/kimi-k2"
                            : rawConfiguredModel;

                    const failureFooter = `\n\n👉 <a href="${settingsLink}">Adjust repository settings</a>`;

                    const helpText = /bad credentials|401|unauthorized/i.test(errorMessage)
                        ? "Likely cause: GitHub authorization has expired. Please reconnect your GitHub account in settings and try again."
                        : /decommissioned|no longer supported|unknown model|model .* not found|unsupported model/i.test(errorMessage)
                        ? "Likely cause: the selected provider model is no longer available (list rotated). Switch model in settings (or enable Google Gemini fallback) and retry."
                            : /no endpoints found/i.test(errorMessage)
                                ? "Likely cause: the selected model is currently unavailable on its provider. Please switch model in settings (recommended: Google Gemini 2.5 Flash) and retry."
                                : /api key is missing|loadapikeyerror|pass it using the 'apiKey' parameter/i.test(errorMessage)
                                    ? "Likely cause: the selected provider API key is missing or invalid. Add a valid key for this provider in settings, or switch to Google Gemini."
                                    : /rate limit|429/i.test(errorMessage)
                                        ? "Likely cause: provider rate limit. Please retry in a few minutes."
                                        : /provider returned error|ai_apicallerror/i.test(errorMessage)
                                            ? "Likely cause: provider-side model routing failure. Please switch model in settings (recommended: Google Gemini 2.5 Flash) and retry."
                                            : "Please retry in a few minutes. If this keeps happening, email dhananiansh01@gmail.com with this PR link.";

                    // Failure comments are operational messages, not the place for memes.
                    const bodyWithoutHumor = [
                        `Review failed: ${configuredProvider}/${configuredModel}`,
                        helpText,
                        failureFooter,
                    ].join("\n");

                    if (progressCommentId) {
                        await octokit.rest.issues.updateComment({
                            owner,
                            repo,
                            comment_id: progressCommentId,
                            body: bodyWithoutHumor,
                        });
                    } else {
                        await octokit.rest.issues.createComment({
                            owner,
                            repo,
                            issue_number: prNumber,
                            body: bodyWithoutHumor,
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
    { id: "test-function", triggers: [{ event: "test.event" }] },
    async ({ event }) => {
        console.log("Test function executed with event data:", event.data);
    }
);

export const processPRMention = inngest.createFunction(
    { id: "process-pr-mention", retries: 3, triggers: [{ event: "pull_request.mention" }] },
    async ({ event, step }) => {
        const { owner, repo, prNumber, userId, commentId, commentBody, senderLogin } = event.data as {
            owner: string;
            repo: string;
            prNumber: number;
            userId: string;
            commentId: number;
            commentBody: string;
            senderLogin: string;
            source?: "issue_comment" | "review_comment" | "review_body";
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

                const mentionPrefix = senderLogin ? `@${senderLogin} ` : "";
                const body = [
                    "## CodeTurtle Reply",
                    "",
                    `${mentionPrefix}${commandResult.body}`,
                    ...commandHumorLines,
                ].join("\n");

                if (event.data?.source === "review_comment") {
                    await octokit.rest.pulls.createReplyForReviewComment({
                        owner,
                        repo,
                        pull_number: prNumber,
                        comment_id: commentId,
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

            // Only respond to specific commands, otherwise use AI for casual response
            const lower = userPrompt.toLowerCase();
            const isDiagramCommand = /diagram|mermaid|flowchart|chart|visual|daigram|generate|visualize/i.test(lower);
            const isMemeCommand = /meme|gif|funny|haha|lol/i.test(lower);
            const isIssuesCommand = /issues|problems|bugs|errors|what.*wrong|what.*problem|list.*issues/i.test(lower);
            const isSummaryCommand = /summary|overview|what.*do|explain.*pr/i.test(lower);
            const isReviewCommand = /review|check|analyze|re-?check/i.test(lower);

            const mentionPrefix = senderLogin ? `@${senderLogin} ` : "";
            let responseText = "";

            // Track if this is an explicit command vs casual chat
            const isExplicitCommand = isMemeCommand || isDiagramCommand || isIssuesCommand || isSummaryCommand || isReviewCommand;

            if (isMemeCommand) {
                // Context-aware meme selection based on actual meaning
                const lower = userPrompt.toLowerCase();

                // Map conversation to right meme scenario
                // success-clean = happy, celebratory, friendly (greetings, thanks, funny)
                // success-warning = light humor, friendly tease (curious, working)
                // success-critical = sympathetic, understanding (problems, confusion)

                let scenario: "success-clean" | "success-warning" | "success-critical" = "success-warning";

                // Greetings first - friendly
                if (/sup|hey|hello|hi|yo|wassup|what's up/i.test(lower)) {
                    scenario = "success-clean"; // friendly greeting
                } else if (/love|love you|love it/i.test(lower)) {
                    scenario = "success-clean"; // heartfelt
                } else if (/thanks|thank you|appreciate/i.test(lower)) {
                    scenario = "success-clean"; // grateful
                } else if (/good job|nice|awesome|cool|great|amazing/i.test(lower)) {
                    scenario = "success-clean"; // positive
                } else if (/funny|haha|lol|rofl|lmao|joke/i.test(lower)) {
                    scenario = "success-clean"; // laughing
                } else if (/confused|don't get|don't understand|wait what/i.test(lower)) {
                    scenario = "success-critical"; // puzzled/confused
                } else if (/what\?|why|how|i don't know/i.test(lower)) {
                    scenario = "success-warning"; // curious
                } else if (/problem|issue|bug|error|wrong|broken|bad|shit/i.test(lower)) {
                    scenario = "success-critical"; // empathetic
                } else if (/haha|😂|🤣/i.test(lower)) {
                    scenario = "success-clean"; // reacting to humor
                } else if (/lol/i.test(lower)) {
                    scenario = "success-clean"; // laughing
                }

                const memeHumor = await getHumorLines(
                    scenario,
                    undefined,
                    { enabled: true, dedupeKey: `meme-${Date.now()}` },
                );
                responseText = memeHumor.length > 0 ? memeHumor.join("\n").replace("\n\n", "\n") : "Here's a meme for you! 🐢";
            } else if (isDiagramCommand) {
                const octokitForDiagram = await getPreferredOctokit(owner, repo, userId);

                // Fetch PR files and diff in parallel
                const [{ data: prFiles }, diffText] = await Promise.all([
                    octokitForDiagram.rest.pulls.listFiles({ owner, repo, pull_number: prNumber }),
                    octokitForDiagram
                        .request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
                            owner,
                            repo,
                            pull_number: prNumber,
                            headers: { accept: "application/vnd.github.v3.diff" },
                        })
                        .then((r) => r.data as unknown as string)
                        .catch(() => ""),
                ]);

                // Pull repo context from RAG
                let ragContext = "";
                const dbRepo = await prisma.repository.findFirst({
                    where: { owner, name: repo, userId },
                    select: { id: true },
                });
                if (dbRepo) {
                    const changedFilenames = prFiles.map((f) => f.filename).join(", ");
                    const ragResults = await queryCodebase(
                        `Architecture, data flow, and module relationships for: ${changedFilenames}`,
                        dbRepo.id,
                        6,
                    ).catch(() => []);
                    ragContext = ragResults
                        .map((r) => `File: ${r.path}\n${r.content.slice(0, 800)}`)
                        .join("\n\n");
                }

                const fileList = prFiles
                    .map((f) => `${f.status}: ${f.filename} (+${f.additions}/-${f.deletions})`)
                    .join("\n");

                const { text: rawDiagram } = await generateText({
                    model: google("gemini-2.5-flash"),
                    system: `You are a software architect. Generate a Mermaid diagram for the pull request changes described below.
Rules:
- Output ONLY raw Mermaid syntax - no code fences, no explanation, no prose
- Use flowchart TD for component/module relationships or call graphs
- Use sequenceDiagram for request/response flows, API chains, or async interactions
- Max 12 nodes; labels ≤4 words using real names from the diff
- Only show components directly touched by the changed files
- Every arrow must represent actual data or control flow`,
                    prompt: [
                        `Changed files (${prFiles.length}):`,
                        fileList,
                        ragContext ? `\nCodebase context:\n${ragContext}` : "",
                        diffText ? `\nDiff (excerpt):\n${diffText.slice(0, 4000)}` : "",
                    ]
                        .filter(Boolean)
                        .join("\n"),
                    maxOutputTokens: 900,
                });

                const cleanDiagram = rawDiagram
                    .replace(/```mermaid\n?/gi, "")
                    .replace(/```\n?/g, "")
                    .trim();

                responseText = `Here's a diagram of the changes in this PR:\n\n\`\`\`mermaid\n${cleanDiagram}\n\`\`\``;
            } else if (isIssuesCommand) {
                // Get issues from stored review
                const review = await prisma.codeReview.findFirst({
                    where: { owner, repo, prNumber, userId, status: "completed" },
                    orderBy: { createdAt: "desc" },
                    select: { files: true },
                });
                if (review?.files && typeof review.files === "object" && "issues" in review.files) {
                    const issues = (review.files as { issues: Array<{ title: string; file: string; severity: string }> }).issues;
                    responseText = issues.length > 0
                        ? `Found ${issues.length} issues:\n${issues.slice(0, 5).map(i => `- ${i.title} (${i.severity}) in ${i.file}`).join("\n")}${issues.length > 5 ? `\n...and ${issues.length - 5} more` : ""}`
                        : "No issues found in the latest review.";
                } else {
                    responseText = "I don't have a completed review for this PR yet. Trigger a new review first.";
                }
            } else if (isSummaryCommand || isReviewCommand) {
                // Get summary from stored review
                const review = await prisma.codeReview.findFirst({
                    where: { owner, repo, prNumber, userId },
                    orderBy: { createdAt: "desc" },
                    select: { summary: true, files: true },
                });
                if (review?.summary) {
                    responseText = review.summary;
                    if (review.files && typeof review.files === "object" && "overallScore" in review.files) {
                        const score = (review.files as { overallScore: number }).overallScore;
                        responseText = `**Score: ${score}/10**\n\n${responseText}`;
                    }
                } else {
                    responseText = "No review available for this PR yet.";
                }
            } else {
                // Handle casual questions - RESPOND TO WHAT USER SAID, NOT ABOUT PR
                // Make it actually vary by using different responses
                const greetings = ["Yo!", "Hey!", "What's up!", "Hi there!", "Yo yo!", "Heyo!", "Sup!", "Hi!"];
                const responses = [
                    "What's good!", "All good here!", "Ready to roll!", "On it!",
                    "Got you!", "Let's go!", "What's happening!", "Cool cool!"
                ];

                // Pick randomly based on user input variation
                const seed = userPrompt.length + userPrompt.charCodeAt(0);
                const greeting = greetings[seed % greetings.length];

                if (/hey|hi|hello|sup|yo/i.test(userPrompt)) {
                    responseText = greeting;
                } else {
                    const response = responses[seed % responses.length];
                    responseText = response;
                }
            }

            // Contextual memes ONLY for explicit commands - not casual chat
            let humorLines: string[] = [];

            if (behaviorSettings.memesEnabled && isExplicitCommand) {
                const lower = userPrompt.toLowerCase();

                // Map conversation to meme categories based on keywords
                let scenario: HumorScenario = "success-warning";

                // user says love you / affectionate - map to success-clean for "celebrat" keyword
                if (/love.*you|i love|love u|❤️|iloveyou/i.test(lower)) {
                    scenario = "success-clean"; // matches "celebrat" in useWhen
                }
                // user gives compliment / thanks / appreciation
                else if (/thanks|thank you|great job|awesome|amazing|good job|well done|nice work|you rock/i.test(lower)) {
                    scenario = "success-clean"; // matches "celebrat" in useWhen
                }
                // user is sad / upset / disappointed
                else if (/sad|upset|disappointed|😢|crying|feeling.*down|not good|feeling.*bad/i.test(lower)) {
                    scenario = "success-critical"; // matches "sad" in keywords
                }
                // user says hi / hello / hey
                else if (/^(hi|hello|hey|sup|yo|what'?s up|howdy|how.?s it|tgid)/i.test(lower)) {
                    scenario = "success-clean"; // matches "celebrat" for friendly greeting
                }
                // user is happy / excited / celebrating
                else if (/happy|excited|woohoo|yay|celebrat|🎉|good news|awesome sauce/i.test(lower)) {
                    scenario = "success-clean"; // matches "celebrat", "happy"
                }
                // user makes joke / is being funny
                else if (/funny|haha|lol|lmao|😂|rofl|🤣|joke|meme|got me/i.test(lower)) {
                    scenario = "success-warning"; // matches "funny" in keywords
                }
                // user insults CodeTurtle / is rude
                else if (/stupid|dumb|idiot|garbage|trash|suck|worst|useless|shit.*bot|damn.*bot/i.test(lower)) {
                    scenario = "success-critical"; // matches "bad", "poor"
                }
                // user says something useful / insightful
                else if (/good point|interesting|insightful|smart|that'?s true|valid point|you'?re right/i.test(lower)) {
                    scenario = "success-clean"; // matches "success" keyword
                }
                // user is confused / doesn't understand
                else if (/confused|don'?t get|what\?|huh|unclear|doesn'?t make|i don'?t understand/i.test(lower)) {
                    scenario = "in-progress"; // matches "analyz" for need to analyze more
                }
                // failure-auth: auth, token, credential
                else if (/auth|token|credential|login|oauth|github.*connect|reconnect/i.test(lower)) {
                    scenario = "failure-auth";
                }
                // failure-model: model, provider, endpoint
                else if (/model|provider|endpoint|api.*key|api.*fail|gemini|openai|anthropic/i.test(lower)) {
                    scenario = "failure-model";
                }
                // failure-rate-limit
                else if (/rate.*limit|too.*many|quota.*exceed|too.*fast|throttle/i.test(lower)) {
                    scenario = "failure-rate-limit";
                }
                // quota-limit
                else if (/quota|wallet|plan.*limit|no.*credits|run.*out.*credit/i.test(lower)) {
                    scenario = "quota-limit";
                }
                // failure-generic: fail, error
                else if (/fail|error|broke|crash|broken|oops|something.*wrong/i.test(lower)) {
                    scenario = "failure-generic";
                }

                humorLines = await getHumorLines(
                    scenario,
                    undefined,
                    { enabled: true, dedupeKey: `context-${Date.now()}` },
                );
            }

            const body = [
                `${mentionPrefix}${responseText}`,
                ...humorLines,
            ].join("\n");

            if (event.data?.source === "review_comment") {
                await octokit.rest.pulls.createReplyForReviewComment({
                    owner,
                    repo,
                    pull_number: prNumber,
                    comment_id: commentId,
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

            l.info("Posted @codeturtle mention reply", { owner, repo, prNumber, commentId, senderLogin });
        });
    },
);
