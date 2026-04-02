import { prisma } from "@/lib/prisma";
import { PLANS, type PlanName, type SubscriptionStatus } from "./billing";
import { logger } from "@/lib/logger";

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
        usageResetAt: new Date(),
      },
    });
  }

  return subscription;
}

export async function checkUsageLimit(userId: string): Promise<{ allowed: boolean; limit: number; used: number; remaining: number }> {
  const subscription = await getOrCreateSubscription(userId);

  const now = new Date();
  if (subscription.usageResetAt && now >= subscription.usageResetAt) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { usageCount: 0, usageResetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1) },
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

export async function canConnectRepo(userId: string): Promise<boolean> {
  const subscription = await getOrCreateSubscription(userId);
  const plan = PLANS[subscription.plan as PlanName] || PLANS.free;

  if (plan.repoLimit === -1) return true;

  const connectedCount = await prisma.repository.count({
    where: { userId },
  });

  return connectedCount < plan.repoLimit;
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const subscription = await getOrCreateSubscription(userId);
  const plan = PLANS[subscription.plan as PlanName] || PLANS.free;
  const usage = await checkUsageLimit(userId);

  return {
    plan: subscription.plan,
    planName: plan.name,
    status: subscription.status,
    price: plan.price,
    features: plan.features,
    usage,
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
          usageResetAt: new Date(),
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
