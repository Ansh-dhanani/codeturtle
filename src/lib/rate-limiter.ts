type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitEntry>();

const DEFAULT_LIMITS = {
  free: { requests: 10, window: 60 * 1000 },
  pro: { requests: 100, window: 60 * 1000 },
  team: { requests: 500, window: 60 * 1000 },
  enterprise: { requests: -1, window: 60 * 1000 },
};

const RATE_LIMITS = {
  api: { requests: 100, window: 60 * 1000 },
  webhook: { requests: 30, window: 60 * 1000 },
  auth: { requests: 10, window: 5 * 60 * 1000 },
  review: { requests: 20, window: 60 * 60 * 1000 },
  contact: { requests: 5, window: 60 * 60 * 1000 },
} as const;

function getEntry(key: string): RateLimitEntry | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.resetAt) {
    store.delete(key);
    return undefined;
  }
  return entry;
}

export async function checkRateLimit(
  userId: string,
  plan: string = "free",
  endpoint: keyof typeof RATE_LIMITS = "api",
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const planLimits = DEFAULT_LIMITS[plan as keyof typeof DEFAULT_LIMITS] || DEFAULT_LIMITS.free;
  const endpointLimits = RATE_LIMITS[endpoint];

  const maxRequests = planLimits.requests === -1 ? -1 : Math.min(planLimits.requests, endpointLimits.requests);
  const window = Math.max(planLimits.window, endpointLimits.window);

  if (maxRequests === -1) {
    return { allowed: true, remaining: -1, resetAt: Date.now() + window };
  }

  const key = `ratelimit:${userId}:${endpoint}`;
  const now = Date.now();
  let entry = getEntry(key);

  if (!entry) {
    entry = { count: 0, resetAt: now + window };
    store.set(key, entry);
  }

  entry.count += 1;

  const allowed = entry.count <= maxRequests;
  const remaining = Math.max(0, maxRequests - entry.count);

  return { allowed, remaining, resetAt: entry.resetAt };
}

export function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}

setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

export { RATE_LIMITS };
