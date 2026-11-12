import { prisma } from "@/lib/prisma";
import { PLANS, type PlanName, type SubscriptionStatus } from "./billing";
import { logger } from "@/lib/logger";

const FREE_REVIEWS_PER_PR_LIMIT = 5;
const PRO_REVIEWS_PER_PR_LIMIT = 10;

// Comma-separated list of special (unlimited) users, usually GitHub logins,
// matched case-insensitively against the user's accountId, name, email, or
// email local-part. Example: "ansh-dhanani,some-other-user"
function getSpecialLimitlessIdentifiers() {
  return (process.env.SPECIAL_LIMITLESS_USERS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeIdentifier(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

function isSpecialIdentifierMatch(candidate: string | null | undefined, identifiers: string[]) {
  const normalized = normalizeIdentifier(candidate);
  if (!normalized || identifiers.length === 0) return false;
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
  if (identifiers.length === 0) return false;

  const githubAccountId = user.accounts.find((account) => account.providerId === "github")?.accountId;
  const emailLocalPart = user.email?.split("@")[0];

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

  // Lazy expiry: comp'd Pro grants (no Polar subscription id) are time-boxed.
  // Real Polar subscriptions are untouched - their plan/status comes from webhooks.
  if (
    subscription &&
    subscription.plan !== "free" &&
    !subscription.polarSubscriptionId &&
    subscription.cancelAtPeriodEnd &&
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd.getTime() <= Date.now()
  ) {
    try {
      subscription = await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          plan: "free",
          status: "active",
          usageLimit: PLANS.free.reviewLimit,
          cancelAtPeriodEnd: false,
          currentPeriodEnd: null,
        },
      });
      logger.info("Comp Pro grant expired; user reverted to free", { userId });
    } catch (err) {
      logger.warn("Failed to expire comp Pro grant", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

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

/** True when the user has connected their own provider API key (BYOK). */
async function hasOwnApiKey(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiApiKey: true },
  });
  return Boolean(user?.aiApiKey);
}

export async function checkUsageLimit(userId: string): Promise<{ allowed: boolean; limit: number; used: number; remaining: number }> {
  if (await isSpecialLimitlessUser(userId)) {
    return { allowed: true, limit: -1, used: 0, remaining: -1 };
  }

  const subscription = await getOrCreateSubscription(userId);
  const ownKey = await hasOwnApiKey(userId);

  // Pro/Enterprise with BYOK → unlimited managed-volume is not billed against shared infra.
  if (subscription.plan !== "free" && ownKey) {
    return { allowed: true, limit: -1, used: 0, remaining: -1 };
  }

  // Sync usageLimit with current plan config (handles plan config changes)
  const planConfig = PLANS[subscription.plan as PlanName] || PLANS.free;
  if (subscription.usageLimit !== planConfig.reviewLimit) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { usageLimit: planConfig.reviewLimit },
    });
    subscription.usageLimit = planConfig.reviewLimit;
  }

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
  if (await isSpecialLimitlessUser(userId)) return;
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
  if (subscription.plan === "enterprise" || await isSpecialLimitlessUser(params.userId) || (subscription.plan !== "free" && await hasOwnApiKey(params.userId))) {
    return { allowed: true, limit: -1, used: 0, remaining: -1 };
  }

  const perPrLimit = subscription.plan === "pro" ? PRO_REVIEWS_PER_PR_LIMIT : FREE_REVIEWS_PER_PR_LIMIT;

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

  const remaining = Math.max(0, perPrLimit - used);
  return {
    allowed: used < perPrLimit,
    limit: perPrLimit,
    used,
    remaining,
  };
}

export async function getPerPRUsageSnapshot(userId: string): Promise<{ limit: number; used: number; remaining: number }> {
  if (await isSpecialLimitlessUser(userId)) {
    return { limit: -1, used: 0, remaining: -1 };
  }

  const subscription = await getOrCreateSubscription(userId);
  if (subscription.plan === "enterprise" || await isSpecialLimitlessUser(userId) || (subscription.plan !== "free" && await hasOwnApiKey(userId))) {
    return { limit: -1, used: 0, remaining: -1 };
  }

  const perPrLimit = subscription.plan === "pro" ? PRO_REVIEWS_PER_PR_LIMIT : FREE_REVIEWS_PER_PR_LIMIT;
  return { limit: perPrLimit, used: 0, remaining: perPrLimit };
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

/** Custom review rules (custom prompts) are a paid-plan feature. */
export async function canUseCustomRules(userId: string): Promise<boolean> {
  if (await isSpecialLimitlessUser(userId)) return true;
  const subscription = await getOrCreateSubscription(userId);
  return subscription.plan !== "free";
}

/** Paid-plan gate for premium models (anthropic, paid slugs, etc.). Free users use free models only. */
export async function canUsePaidModels(userId: string): Promise<boolean> {
  if (await isSpecialLimitlessUser(userId)) return true;
  const subscription = await getOrCreateSubscription(userId);
  return subscription.plan !== "free";
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
    specialLimitless,
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
