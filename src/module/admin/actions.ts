"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin, isAdminEmail } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { logger } from "@/lib/logger";

/** Lightweight client-side check for showing/hiding admin navigation. Actual access is ALWAYS enforced server-side. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return isAdminEmail(session?.user?.email ?? null);
  } catch {
    return false;
  }
}

/** Comp a user to Pro for N months (default 1). Expiry is enforced lazily in billing.server (no cron needed). */
export async function grantCompPro(params: { userId: string; months?: number }): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "Admin access required" };
  }

  const months = Math.max(1, Math.min(12, Math.floor(params.months ?? 1)));
  const currentPeriodEnd = new Date();
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + months);

  try {
    await prisma.subscription.upsert({
      where: { userId: params.userId },
      create: {
        userId: params.userId,
        plan: "pro",
        status: "active",
        usageLimit: -1,
        usageCount: 0,
        cancelAtPeriodEnd: true,
        currentPeriodEnd,
        usageResetAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
      },
      update: {
        plan: "pro",
        status: "active",
        usageLimit: -1,
        cancelAtPeriodEnd: true,
        currentPeriodEnd,
      },
    });
    logger.info("Admin granted comp Pro", { userId: params.userId, months });
    return { ok: true };
  } catch (err) {
    logger.error("Failed to grant comp Pro", err as Error, { userId: params.userId });
    return { ok: false, error: err instanceof Error ? err.message : "Failed to grant Pro" };
  }
}

/** Revoke a comp'd Pro grant immediately (real Polar subscriptions are untouched). */
export async function revokeCompPro(params: { userId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "Admin access required" };
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId: params.userId },
    select: { polarSubscriptionId: true },
  });

  if (subscription?.polarSubscriptionId) {
    return { ok: false, error: "User has a real Polar subscription - manage it from the customer portal instead" };
  }

  try {
    await prisma.subscription.updateMany({
      where: { userId: params.userId },
      data: {
        plan: "free",
        status: "active",
        usageLimit: 20,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      },
    });
    logger.info("Admin revoked comp Pro", { userId: params.userId });
    return { ok: true };
  } catch (err) {
    logger.error("Failed to revoke comp Pro", err as Error, { userId: params.userId });
    return { ok: false, error: err instanceof Error ? err.message : "Failed to revoke Pro" };
  }
}

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: string;
  plan: string;
  subscriptionStatus: string;
  compProUntil: string | null;
  hasPolarSubscription: boolean;
  repos: number;
  reviewCount: number;
  avgScore: number | null;
  lastReviewAt: string | null;
  monthlyUsage: number;
  monthlyLimit: number;
};

export type AdminReviewRow = {
  id: string;
  owner: string;
  repo: string;
  prNumber: number;
  prTitle: string | null;
  prUrl: string | null;
  status: string;
  score: number | null;
  reviewerModel: string | null;
  createdAt: string;
  userName: string;
  userEmail: string;
};

export type AdminOverview = {
  totals: {
    users: number;
    adminUsers: number;
    specialLimitlessUsers: number;
    newUsers7d: number;
    newUsers30d: number;
    repositories: number;
    reviews: number;
    completedReviews: number;
    failedReviews: number;
    reviews7d: number;
    reviews30d: number;
    reviewsToday: number;
    monthlyUsageTotal: number;
    completionRate: number;
  };
  plans: Array<{ plan: string; status: string; count: number }>;
  specialLimitlessIdentifiers: string[];
  usageTopUsers: Array<{ id: string; name: string; email: string; plan: string; monthlyUsage: number; monthlyLimit: number }>;
  users: AdminUserRow[];
  recentReviews: AdminReviewRow[];
};

function asOverallScore(files: unknown): number | null {
  if (files && typeof files === "object" && !Array.isArray(files)) {
    const score = (files as { overallScore?: unknown }).overallScore;
    return typeof score === "number" && Number.isFinite(score) ? score : null;
  }
  return null;
}

function asReviewerModel(files: unknown): string | null {
  if (files && typeof files === "object" && !Array.isArray(files)) {
    const f = files as { reviewerModel?: unknown };
    return typeof f.reviewerModel === "string" ? f.reviewerModel : null;
  }
  return null;
}

const dayAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

export async function getAdminOverview(): Promise<AdminOverview> {
  const principal = await requireAdmin();

  const since7d = dayAgo(7);
  const since30d = dayAgo(30);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [
    users,
    newUsers7d,
    newUsers30d,
    repositories,
    reviewTotals,
    reviews7d,
    reviews30d,
    reviewsToday,
    planGroups,
    failedToday,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since7d } } }),
    prisma.user.count({ where: { createdAt: { gte: since30d } } }),
    prisma.repository.count(),
    prisma.codeReview.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.codeReview.count({ where: { createdAt: { gte: since7d } } }),
    prisma.codeReview.count({ where: { createdAt: { gte: since30d } } }),
    prisma.codeReview.count({ where: { createdAt: { gte: today } } }),
    prisma.subscription.groupBy({
      by: ["plan", "status"],
      _count: { _all: true },
    }),
    prisma.codeReview.count({
      where: { status: "failed", createdAt: { gte: dayAgo(1) } },
    }),
  ]);

  const statusCount = new Map(reviewTotals.map((row) => [row.status, row._count._all]));
  const reviews = [...statusCount.values()].reduce((sum, n) => sum + n, 0);
  const completedReviews = statusCount.get("completed") ?? 0;
  const failedReviews = statusCount.get("failed") ?? 0;
  const completionRate = reviews > 0 ? Math.round((completedReviews / reviews) * 100) : 0;
  const monthlyUsageTotal = await prisma.subscription.aggregate({
    _sum: { usageCount: true },
  }).then((r) => r._sum.usageCount ?? 0);

  // One pass over users with everything the admin needs for the tables.
  // `reviews` is bounded to the last 30 per user so avg-score computation stays cheap.
  const rawUsers = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
      subscription: { select: { plan: true, status: true, usageCount: true, usageLimit: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, polarSubscriptionId: true } },
      reviews: { select: { createdAt: true, status: true, files: true }, orderBy: { createdAt: "desc" }, take: 30 },
      _count: { select: { reviews: true, repositories: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 1000,
  });

  const usersRows: AdminUserRow[] = rawUsers.map((user) => {
    const scores = user.reviews.map((r) => asOverallScore(r.files)).filter((s): s is number => s !== null);
    const avgScore = scores.length ? Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10 : null;
    const lastReviewAt = user.reviews[0]?.createdAt ?? null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image ?? null,
      createdAt: user.createdAt.toISOString(),
      plan: user.subscription?.plan ?? "free",
      subscriptionStatus: user.subscription?.status ?? "active",
      compProUntil: user.subscription?.currentPeriodEnd?.toISOString() ?? null,
      hasPolarSubscription: Boolean(user.subscription?.polarSubscriptionId),
      repos: user._count.repositories,
      reviewCount: user._count.reviews,
      avgScore,
      lastReviewAt: lastReviewAt ? lastReviewAt.toISOString() : null,
      monthlyUsage: user.subscription?.usageCount ?? 0,
      monthlyLimit: user.subscription?.usageLimit ?? 10,
    };
  });

  const usageTopUsers = [...usersRows]
    .sort((a, b) => b.monthlyUsage - a.monthlyUsage)
    .slice(0, 10)
    .map((u) => ({ id: u.id, name: u.name, email: u.email, plan: u.plan, monthlyUsage: u.monthlyUsage, monthlyLimit: u.monthlyLimit }));

  const recentReviewsRows = await prisma.codeReview.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    include: { user: { select: { name: true, email: true } } },
  });

  const recentReviews: AdminReviewRow[] = recentReviewsRows.map((review) => ({
    id: review.id,
    owner: review.owner,
    repo: review.repo,
    prNumber: review.prNumber,
    prTitle: review.prTitle,
    prUrl: review.prUrl,
    status: review.status,
    score: asOverallScore(review.files),
    reviewerModel: asReviewerModel(review.files),
    createdAt: review.createdAt.toISOString(),
    userName: review.user.name,
    userEmail: review.user.email,
  }));

  const specialLimitlessIdentifiers = (process.env.SPECIAL_LIMITLESS_USERS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const adminCount = (process.env.ADMIN_USERS || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean).length;

  if (rawUsers.length >= 1000) {
    logger.warn("Admin overview truncated at 1000 users; pagination not implemented yet", { principal: principal.email });
  }

  return {
    totals: {
      users,
      adminUsers: adminCount,
      specialLimitlessUsers: specialLimitlessIdentifiers.length,
      newUsers7d,
      newUsers30d,
      repositories,
      reviews,
      completedReviews,
      failedReviews,
      reviews7d,
      reviews30d,
      reviewsToday,
      monthlyUsageTotal,
      completionRate,
    },
    plans: planGroups.map((row) => ({
      plan: row.plan,
      status: row.status,
      count: row._count._all,
    })),
    specialLimitlessIdentifiers,
    usageTopUsers,
    users: usersRows.sort((a, b) => {
      const aTime = a.lastReviewAt ? Date.parse(a.lastReviewAt) : 0;
      const bTime = b.lastReviewAt ? Date.parse(b.lastReviewAt) : 0;
      if (bTime !== aTime) return bTime - aTime;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    }),
    recentReviews,
  };
}
