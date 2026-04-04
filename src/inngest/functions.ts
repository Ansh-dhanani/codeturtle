
import { prisma } from "@/lib/prisma";
import { inngest } from "./client";
import { z } from "zod";
import { getRepoFileContents } from "@/module/github/github";
import { indexCodebase, deleteRepoVectors } from "@/module/ai/lib/rag";
import { createLogger } from "@/lib/logger";
import { Prisma } from "@prisma/client";
import { Octokit } from "octokit";
import { checkPerPRReviewLimit, checkUsageLimit, incrementUsage } from "@/lib/billing.server";

const l = createLogger("inngest-functions");

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
{id: "process-pr-event"},
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
                ].join("\n"),
            });
        });
        l.warn("Per-PR review limit reached; skipping PR review", { owner, repo, prNumber, userId, action, perPrUsage });
        return { skipped: true, reason: "per_pr_limit_reached", perPrUsage };
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
            ].join("\n"),
        });
        l.info("Posted review in progress comment", { owner, repo, prNumber, commentId: comment.id });
        return comment.id;
    })

    const review = await step.run("Generate PR review", async ()=>{
        const { generateCodeReview } = await import("@/module/ai/lib/review");
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { aiModel: true } });
        return await generateCodeReview({ owner, repo, prNumber, userId, model: user?.aiModel });
    })

    await step.run("Store review", async ()=>{
        const dbRepo = await prisma.repository.findFirst({
            where: { owner, name: repo, userId },
        });
        if (!dbRepo) {
            throw new Error(`Repository ${owner}/${repo} is not connected for user ${userId}.`);
        }
        await prisma.codeReview.create({
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
        });
        await incrementUsage(userId);
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

        const prBody = [
            `## CodeTurtle AI Review — Score: ${review.overallScore}/10`,
            "",
            review.summary,
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
            await octokit.rest.pulls.createReview({
                owner,
                repo,
                pull_number: prNumber,
                body: prBody,
                event: reviewEvent,
                comments: reviewComments,
            });
            l.info("PR review posted to GitHub", { owner, repo, prNumber, comments: reviewComments.length, event: reviewEvent });
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
                    "Review complete. See the review above for details.",
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
                const helpText = /bad credentials|401|unauthorized/i.test(errorMessage)
                    ? "Please reconnect your GitHub account in settings and try again."
                    : "Please retry in a few minutes. If this keeps happening, contact support with this PR link.";
                const body = [
                    "## CodeTurtle AI Review",
                    "",
                    "Sorry, I could not complete this automated review.",
                    helpText,
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

        throw err;
    }
});


export const testFunction = inngest.createFunction(
  { id: "test-function" },
  { event: "test.event" },
  async ({ event, step }) => {
    console.log("Test function executed with event data:", event.data);
  }
);