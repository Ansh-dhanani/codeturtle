"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { generateCodeReview } from "@/module/ai/lib/review";
import { checkUsageLimit, incrementUsage, canConnectRepo, getSubscriptionStatus, checkPerPRReviewLimit, isSpecialLimitlessUser } from "@/lib/billing.server";
import { checkRateLimit } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";

const MAX_FREE_PLAN_PR_COMMITS = 3;

export async function getReviews(params?: { repoFullName?: string; limit?: number }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const reviews = await prisma.codeReview.findMany({
    where: {
      userId: session.user.id,
      ...(params?.repoFullName ? { owner: params.repoFullName.split("/")[0], repo: params.repoFullName.split("/")[1] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: params?.limit || 20,
  });

  return reviews.map((r) => ({
    ...r,
    files: r.files as unknown as Record<string, unknown>,
  }));
}

export async function getReviewById(id: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const review = await prisma.codeReview.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!review) throw new Error("Review not found");

  return {
    ...review,
    files: review.files as unknown as Record<string, unknown>,
  };
}

export async function triggerReview(owner: string, repo: string, prNumber: number) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;

  const usage = await checkUsageLimit(userId);
  if (!usage.allowed) {
    throw new Error("Review limit reached. Upgrade your plan for more reviews.");
  }

  const perPrUsage = await checkPerPRReviewLimit({ userId, owner, repo, prNumber });
  if (!perPrUsage.allowed) {
    throw new Error(`Per-PR review limit reached for this month (${perPrUsage.used}/${perPrUsage.limit}).`);
  }

  const specialLimitless = await isSpecialLimitlessUser(userId);
  if (!specialLimitless) {
    const rateLimit = await checkRateLimit(userId, "free", "review");
    if (!rateLimit.allowed) {
      throw new Error("Rate limit exceeded. Please try again later.");
    }
  }

  const repoRecord = await prisma.repository.findFirst({
    where: { owner, name: repo, userId },
  });

  if (!repoRecord) {
    throw new Error("Repository not connected. Please connect it first.");
  }

  if (!specialLimitless) {
    const subscription = await getSubscriptionStatus(userId);
    if (subscription.plan === "free") {
      const account = await prisma.account.findFirst({
        where: { userId, providerId: "github" },
        select: { accessToken: true },
      });

      if (!account?.accessToken) {
        throw new Error("No GitHub access token found. Please reconnect your GitHub account.");
      }

      const { Octokit } = await import("octokit");
      const octokit = new Octokit({ auth: account.accessToken });
      const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });

      if ((pr.commits || 0) > MAX_FREE_PLAN_PR_COMMITS) {
        throw new Error(
          `Free plan supports PR reviews for up to ${MAX_FREE_PLAN_PR_COMMITS} commits per PR. This PR has ${pr.commits} commits.`,
        );
      }
    }
  }

  const review = await prisma.codeReview.create({
    data: {
      userId,
      owner,
      repo,
      prNumber,
      repositoryId: repoRecord.id,
      status: "pending",
    },
  });

  await inngest.send({
    name: "pull_request.opened",
    data: {
      owner,
      repo,
      prNumber,
      userId,
      action: "review_requested",
    },
  });

  logger.info("Review triggered", { owner, repo, prNumber, userId });

  return { success: true, reviewId: review.id };
}

export async function triggerFileReview(repoId: string, filePath: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;

  const usage = await checkUsageLimit(userId);
  if (!usage.allowed) {
    throw new Error("Review limit reached. Upgrade your plan for more reviews.");
  }

  const repoRecord = await prisma.repository.findFirst({
    where: { id: repoId, userId },
  });

  if (!repoRecord) throw new Error("Repository not found");

  const account = await prisma.account.findFirst({
    where: { userId, providerId: "github" },
  });

  if (!account?.accessToken) throw new Error("No GitHub access token found");

  const { Octokit } = await import("octokit");
  const octokit = new Octokit({ auth: account.accessToken });

  const { data: fileData } = await octokit.rest.repos.getContent({
    owner: repoRecord.owner,
    repo: repoRecord.name,
    path: filePath,
  });

  if (Array.isArray(fileData) || fileData.type !== "file" || !fileData.content) {
    throw new Error("Could not fetch file content");
  }

  const content = Buffer.from(fileData.content, "base64").toString("utf-8");
  const review = await generateCodeReview({
    owner: repoRecord.owner,
    repo: repoRecord.name,
    prNumber: 0,
    userId,
  });

  const storedReview = await prisma.codeReview.create({
    data: {
      userId,
      owner: repoRecord.owner,
      repo: repoRecord.name,
      prNumber: 0,
      repositoryId: repoRecord.id,
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

  return { success: true, reviewId: storedReview.id };
}

export async function getUserSubscription() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  return getSubscriptionStatus(session.user.id);
}

export async function checkCanConnectRepo() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  return canConnectRepo(session.user.id);
}

export async function deleteReview(id: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  await prisma.codeReview.deleteMany({
    where: { id, userId: session.user.id },
  });

  return { success: true };
}

export async function generateFixPR(reviewId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const userId = session.user.id;

  const review = await prisma.codeReview.findFirst({
    where: { id: reviewId, userId },
  });

  if (!review) throw new Error("Review not found");

  const reviewFiles = review.files as Record<string, unknown> | null;
  const suggestions = (reviewFiles?.suggestions as Array<{ file: string; codeAfter?: string; codeBefore?: string; title: string; description: string }>) || [];

  if (suggestions.length === 0) {
    throw new Error("No suggestions available to generate fixes");
  }

  const account = await prisma.account.findFirst({
    where: { userId, providerId: "github" },
  });

  if (!account?.accessToken) throw new Error("No GitHub access token found");

  const { Octokit } = await import("octokit");
  const octokit = new Octokit({ auth: account.accessToken });

  const branchName = `codeturtle/fix-pr-${review.prNumber}`;

  const { data: repo } = await octokit.rest.repos.get({
    owner: review.owner,
    repo: review.repo,
  });

  const { data: ref } = await octokit.rest.git.getRef({
    owner: review.owner,
    repo: review.repo,
    ref: `heads/${repo.default_branch}`,
  });

  await octokit.rest.git.createRef({
    owner: review.owner,
    repo: review.repo,
    ref: `refs/heads/${branchName}`,
    sha: ref.object.sha,
  });

  const commits: Array<{ file: string; message: string }> = [];

  for (const suggestion of suggestions) {
    if (!suggestion.codeAfter) continue;

    const { data: fileData } = await octokit.rest.repos.getContent({
      owner: review.owner,
      repo: review.repo,
      path: suggestion.file,
      ref: branchName,
    });

    if (Array.isArray(fileData) || fileData.type !== "file") continue;

    await octokit.rest.repos.createOrUpdateFileContents({
      owner: review.owner,
      repo: review.repo,
      path: suggestion.file,
      message: `fix: ${suggestion.title}`,
      content: Buffer.from(suggestion.codeAfter).toString("base64"),
      sha: fileData.sha,
      branch: branchName,
    });

    commits.push({ file: suggestion.file, message: suggestion.title });
  }

  if (commits.length === 0) {
    await octokit.rest.git.deleteRef({
      owner: review.owner,
      repo: review.repo,
      ref: `heads/${branchName}`,
    });
    throw new Error("No code changes could be applied");
  }

  const { data: pr } = await octokit.rest.pulls.create({
    owner: review.owner,
    repo: review.repo,
    title: `CodeTurtle: Fix ${commits.length} issue${commits.length > 1 ? "s" : ""} from PR #${review.prNumber}`,
    head: branchName,
    base: repo.default_branch,
    body: [
      `This PR was automatically generated by CodeTurtle AI to fix issues found in PR #${review.prNumber}.`,
      "",
      `## Changes (${commits.length})`,
      ...commits.map((c) => `- **${c.file}**: ${c.message}`),
      "",
      `Original review score: ${reviewFiles?.overallScore || "N/A"}/10`,
    ].join("\n"),
  });

  await prisma.codeReview.update({
    where: { id: reviewId },
    data: { status: "fixes_applied" },
  });

  return { success: true, prUrl: pr.html_url, prNumber: pr.number };
}
