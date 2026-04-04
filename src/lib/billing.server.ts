import { prisma } from "@/lib/prisma";
import { PLANS, type PlanName, type SubscriptionStatus } from "./billing";
import { logger } from "@/lib/logger";

const FREE_REVIEWS_PER_PR_LIMIT = 5;
const DEFAULT_SPECIAL_LIMITLESS_IDENTIFIERS = ["ansh-dhanani"];

function getSpecialLimitlessIdentifiers() {
  const extra = (process.env.SPECIAL_LIMITLESS_USERS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return [...new Set([...DEFAULT_SPECIAL_LIMITLESS_IDENTIFIERS, ...extra])];
}

function normalizeIdentifier(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

function isSpecialIdentifierMatch(candidate?: string | null, identifiers: string[] = getSpecialLimitlessIdentifiers()) {
  const normalized = normalizeIdentifier(candidate);
  if (!normalized) return false;
  return identifiers.includes(normalized);
}

export async function isSpecialLimitlessUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      accounts: {
        select: {
          providerId: true,
          accountId: true,
        },
      },
    },
  });

  if (!user) return false;

  const identifiers = getSpecialLimitlessIdentifiers();
  const emailLocalPart = user.email?.split("@")[0];
  const githubAccountId = user.accounts.find((account) => account.providerId === "github")?.accountId;

  return [user.name, user.email, emailLocalPart, githubAccountId].some((value) =>
    isSpecialIdentifierMatch(value, identifiers),
  );
}

function getNextMonthResetDate(base = new Date()) {
  return new Date(base.getFullYear(), base.getMonth() + 1, 1);
}

function getCurrentMonthRange(base = new Date()) {
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  return { start, end };
}

export async function getOrCreateSubscription(userId: string) {
  let subscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (!subscription) {
    subscription = await prisma.subscription.create({
      data: {
        userId,
        plan: "free",
        status: "active",
        usageLimit: PLANS.free.reviewLimit,
        usageCount: 0,
        usageResetAt: getNextMonthResetDate(),
      },
    });
  }

  return subscription;
}

export async function checkUsageLimit(userId: string): Promise<{ allowed: boolean; limit: number; used: number; remaining: number }> {
  if (await isSpecialLimitlessUser(userId)) {
    return { allowed: true, limit: -1, used: 0, remaining: -1 };
  }

  const subscription = await getOrCreateSubscription(userId);

  const now = new Date();
  if (subscription.usageResetAt && now >= subscription.usageResetAt) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { usageCount: 0, usageResetAt: getNextMonthResetDate(now) },
    });
    subscription.usageCount = 0;
  }

  const limit = subscription.usageLimit;
  const used = subscription.usageCount;
  const remaining = limit === -1 ? -1 : Math.max(0, limit - used);
  const allowed = limit === -1 || used < limit;

  return { allowed, limit, used, remaining };
}

export async function incrementUsage(userId: string): Promise<void> {
  await prisma.subscription.updateMany({
    where: { userId },
    data: { usageCount: { increment: 1 } },
  });
}

export async function checkPerPRReviewLimit(params: {
  userId: string;
  owner: string;
  repo: string;
  prNumber: number;
}): Promise<{ allowed: boolean; limit: number; used: number; remaining: number }> {
  if (await isSpecialLimitlessUser(params.userId)) {
    return { allowed: true, limit: -1, used: 0, remaining: -1 };
  }

  const subscription = await getOrCreateSubscription(params.userId);
  if (subscription.plan !== "free") {
    return { allowed: true, limit: -1, used: 0, remaining: -1 };
  }

  const { start, end } = getCurrentMonthRange();
  const used = await prisma.codeReview.count({
    where: {
      userId: params.userId,
      owner: params.owner,
      repo: params.repo,
      prNumber: params.prNumber,
      createdAt: {
        gte: start,
        lt: end,
      },
    },
  });

  const remaining = Math.max(0, FREE_REVIEWS_PER_PR_LIMIT - used);
  return {
    allowed: used < FREE_REVIEWS_PER_PR_LIMIT,
    limit: FREE_REVIEWS_PER_PR_LIMIT,
    used,
    remaining,
  };
}

export async function getPerPRUsageSnapshot(userId: string): Promise<{ limit: number; used: number; remaining: number }> {
  if (await isSpecialLimitlessUser(userId)) {
    return { limit: -1, used: 0, remaining: -1 };
  }

  const subscription = await getOrCreateSubscription(userId);
  if (subscription.plan !== "free") {
    return { limit: -1, used: 0, remaining: -1 };
  }

  return { limit: FREE_REVIEWS_PER_PR_LIMIT, used: 0, remaining: FREE_REVIEWS_PER_PR_LIMIT };
}

export async function canConnectRepo(userId: string): Promise<boolean> {
  if (await isSpecialLimitlessUser(userId)) {
    return true;
  }

  const subscription = await getOrCreateSubscription(userId);
  const plan = PLANS[subscription.plan as PlanName] || PLANS.free;

  if (plan.repoLimit === -1) return true;

  const connectedCount = await prisma.repository.count({
    where: { userId },
  });

  return connectedCount < plan.repoLimit;
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const specialLimitless = await isSpecialLimitlessUser(userId);
  const subscription = await getOrCreateSubscription(userId);
  const plan = PLANS[subscription.plan as PlanName] || PLANS.free;
  const usage = await checkUsageLimit(userId);
  const perPrUsage = await getPerPRUsageSnapshot(userId);

  return {
    plan: subscription.plan,
    planName: specialLimitless ? "Special Unlimited" : plan.name,
    status: subscription.status,
    price: plan.price,
    features: specialLimitless
      ? [...plan.features, "Unlimited reviews", "Unlimited repositories", "Unlimited per-PR reviews"]
      : plan.features,
    usage,
    perPrUsage,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    polarSubscriptionId: subscription.polarSubscriptionId,
  };
}

export async function handlePolarSubscriptionEvent(event: {
  type: string;
  data: {
    subscription_id?: string;
    customer_id?: string;
    user_id?: string;
    status?: string;
    current_period_end?: string;
    cancel_at_period_end?: boolean;
    metadata?: { userId?: string; plan?: string };
  };
}) {
  const { type, data } = event;
  const userId = data.metadata?.userId || data.user_id;

  if (!userId) {
    logger.error("Polar event missing userId", undefined, { type, data });
    return;
  }

  const planMap: Record<string, string> = {
    pro: "pro",
    team: "team",
    enterprise: "enterprise",
  };

  const plan = planMap[data.metadata?.plan || ""] || "pro";
  const planConfig = PLANS[plan as PlanName] || PLANS.pro;

  switch (type) {
    case "subscription.created":
    case "subscription.updated":
      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          plan,
          status: data.status || "active",
          polarSubscriptionId: data.subscription_id,
          polarCustomerId: data.customer_id,
          currentPeriodEnd: data.current_period_end ? new Date(data.current_period_end) : null,
          cancelAtPeriodEnd: data.cancel_at_period_end || false,
          usageLimit: planConfig.reviewLimit,
          usageCount: 0,
          usageResetAt: getNextMonthResetDate(),
        },
        update: {
          plan,
          status: data.status || "active",
          polarSubscriptionId: data.subscription_id,
          currentPeriodEnd: data.current_period_end ? new Date(data.current_period_end) : null,
          cancelAtPeriodEnd: data.cancel_at_period_end || false,
          usageLimit: planConfig.reviewLimit,
        },
      });
      logger.info("Subscription updated via Polar", { userId, plan, status: data.status });
      break;

    case "subscription.revoked":
    case "subscription.canceled":
      await prisma.subscription.updateMany({
        where: { userId },
        data: {
          status: "canceled",
          plan: "free",
          usageLimit: PLANS.free.reviewLimit,
          cancelAtPeriodEnd: false,
        },
      });
      logger.info("Subscription canceled via Polar", { userId });
      break;

    case "subscription.active":
      await prisma.subscription.updateMany({
        where: { userId },
        data: {
          status: "active",
          plan,
          usageLimit: planConfig.reviewLimit,
        },
      });
      logger.info("Subscription activated via Polar", { userId, plan });
      break;
  }
}
