export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    reviewLimit: 20,
    repoLimit: 5,
    features: ["20 reviews/month", "5 repositories", "5 reviews per PR", "3 commits per PR max", "AI code review", "Community support"],
  },
  pro: {
    name: "Pro",
    price: 4,
    reviewLimit: -1,
    repoLimit: -1,
    features: ["Unlimited reviews", "Unlimited repositories", "Unlimited reviews per PR", "Unlimited commits per PR", "Bring your own API keys", "Custom rules (custom prompts)", "Priority support"],
  },
  enterprise: {
    name: "Enterprise",
    price: 49,
    reviewLimit: -1,
    repoLimit: -1,
    features: ["Unlimited reviews", "Unlimited repositories", "Unlimited reviews & commits per PR", "Custom rules (custom prompts)", "Priority support", "Everything in Pro + contact us for org onboarding"],
  },
} as const;

export type PlanName = keyof typeof PLANS;

export function getPlan(plan?: string | null) {
  return PLANS[(plan as PlanName) ?? "free"] ?? PLANS.free;
}

/** Repo limit for a plan; -1 means unlimited. */
export function repoLimitFor(plan?: string | null): number {
  return getPlan(plan).repoLimit;
}

/** Custom rules (custom review prompts) are a paid-plan feature. */
export function canUseCustomRulesFor(plan?: string | null): boolean {
  return (plan ?? "free") !== "free";
}

export type SubscriptionStatus = {
  plan: string;
  planName: string;
  status: string;
  price: number;
  features: readonly string[];
  usage: { allowed: boolean; limit: number; used: number; remaining: number };
  perPrUsage: { limit: number; used: number; remaining: number };
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  polarSubscriptionId: string | null;
};
