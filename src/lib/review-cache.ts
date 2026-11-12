import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export type ReviewContextCachePayload = {
  diff: string;
  files: Array<{ filename: string; status: string; additions: number; deletions: number }>;
  prTitle: string;
  prBody: string;
  prCommits: number | null;
  prBaseRef: string;
  prHeadRef: string;
  contextChunks: string[];
};

/**
 * Read a cached review context. Returns null on miss OR on any error
 * (e.g. table does not exist yet in a fresh environment) - callers must
 * treat cache failure as "cache miss", never as fatal.
 */
export async function getCachedReviewContext(key: string): Promise<ReviewContextCachePayload | null> {
  try {
    const row = await prisma.reviewContextCache.findUnique({ where: { key } });
    if (!row) return null;
    if (row.expiresAt.getTime() < Date.now()) {
      await prisma.reviewContextCache.delete({ where: { key } }).catch(() => undefined);
      return null;
    }
    logger.info("Review context cache hit", { key });
    return row.payload as unknown as ReviewContextCachePayload;
  } catch (err) {
    logger.warn("Review context cache read failed; treating as miss", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Store a review context. Failures are swallowed (cache is an optimization,
 * never required for correctness).
 */
export async function setCachedReviewContext(key: string, payload: ReviewContextCachePayload): Promise<void> {
  try {
    await prisma.reviewContextCache.upsert({
      where: { key },
      create: {
        key,
        payload: payload as unknown as object,
        expiresAt: new Date(Date.now() + CACHE_TTL_MS),
      },
      update: {
        payload: payload as unknown as object,
        expiresAt: new Date(Date.now() + CACHE_TTL_MS),
      },
    });
    logger.info("Review context cached", { key, bytes: JSON.stringify(payload).length });
  } catch (err) {
    logger.warn("Review context cache write failed; continuing without caching", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Best-effort cleanup of expired rows. Safe to call from cron/Inngest; never throws. */
export async function pruneExpiredReviewContextCache(): Promise<number> {
  try {
    const result = await prisma.reviewContextCache.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  } catch (err) {
    logger.warn("Review context cache prune failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
