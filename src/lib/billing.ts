export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    reviewLimit: 20,
    repoLimit: 2,
    features: ["20 reviews/month", "5 reviews per PR", "2 repositories", "Basic AI review", "Email support"],
  },
  pro: {
    name: "Pro",
    price: 19,
    reviewLimit: 100,
    repoLimit: 20,
    features: ["100 reviews/month", "20 repositories", "Advanced AI review", "Priority support", "PR diff analysis", "Custom rules"],
  },
  team: {
    name: "Team",
    price: 49,
    reviewLimit: 500,
    repoLimit: 100,
    features: ["500 reviews/month", "100 repositories", "Advanced AI review", "Priority support", "PR diff analysis", "Custom rules", "Team collaboration", "SSO"],
  },
  enterprise: {
    name: "Enterprise",
    price: 149,
    reviewLimit: -1,
    repoLimit: -1,
    features: ["Unlimited reviews", "Unlimited repositories", "Advanced AI review", "Dedicated support", "PR diff analysis", "Custom rules", "Team collaboration", "SSO", "SLA", "On-premise option"],
  },
} as const;

export type PlanName = keyof typeof PLANS;

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
