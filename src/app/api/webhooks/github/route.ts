import prisma from '@/lib/prisma';
import crypto from 'crypto';
import { inngest } from '@/inngest/client';
import { createLogger } from '@/lib/logger';

const l = createLogger('webhook-github');
const DELIVERY_TTL_MS = 10 * 60 * 1000;
const EVENT_TTL_MS = 5 * 60 * 1000;
const processedDeliveries = new Map<string, number>();
const processedEventKeys = new Map<string, number>();

function cleanupCache(cache: Map<string, number>, ttlMs: number, now: number) {
  for (const [key, value] of cache.entries()) {
    if (now - value > ttlMs) {
      cache.delete(key);
    }
  }
}

function registerAndCheckDuplicate(cache: Map<string, number>, key: string, ttlMs: number, now: number): boolean {
  cleanupCache(cache, ttlMs, now);
  if (cache.has(key)) return true;
  cache.set(key, now);
  return false;
}

function shortHash(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function timingSafeCompare(a: string, b: string) {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const event = (req.headers.get('x-github-event') || '').toLowerCase();
  const delivery = req.headers.get('x-github-delivery') || '';
  const sig256 = req.headers.get('x-hub-signature-256') || '';
  const sig1 = req.headers.get('x-hub-signature') || '';

  const buf = await req.arrayBuffer();
  const payload = Buffer.from(buf);

  type ParsedBody = {
    hook_id?: number;
    repository?: { full_name?: string; owner?: { login?: string }; name?: string };
    action?: string;
    pull_request?: { number: number; title?: string; user?: { login?: string }; head?: { sha?: string } };
    review?: { id?: number; body?: string };
    issue?: { number?: number; pull_request?: { url?: string } };
    comment?: { id?: number; body?: string };
    sender?: { login?: string; type?: string };
    [key: string]: unknown;
  };
  let parsedBody: ParsedBody | null;
  try {
    parsedBody = JSON.parse(payload.toString());
  } catch (err) {
    l.warn('Failed to parse webhook payload', { delivery, error: (err as Error).message });
    return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  let repoRecord: { hookSecret: string | null; userId: string; owner: string; name: string } | null = null;
  try {
    if (parsedBody?.hook_id && typeof parsedBody.hook_id === 'number') {
      const found = await prisma.repository.findFirst({ 
        where: { hookId: BigInt(parsedBody.hook_id) },
        select: { hookSecret: true, userId: true, owner: true, name: true }
      });
      if (found) {
        repoRecord = found;
      }
    }
    if (!repoRecord && parsedBody?.repository?.full_name) {
      const found = await prisma.repository.findFirst({ 
        where: { fullName: parsedBody.repository.full_name },
        select: { hookSecret: true, userId: true, owner: true, name: true }
      });
      if (found) {
        repoRecord = found;
      }
    }
  } catch (err) {
    l.error('Error looking up repository for webhook', err as Error, { delivery });
  }

  const candidateSecrets = [repoRecord?.hookSecret, process.env.GITHUB_WEBHOOK_SECRET]
    .filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index);

  if (repoRecord && candidateSecrets.length > 0) {
    let signatureValid = false;

    for (const secret of candidateSecrets) {
      const computed256 = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const computed1 = 'sha1=' + crypto.createHmac('sha1', secret).update(payload).digest('hex');
      const valid256 = sig256 ? timingSafeCompare(sig256, computed256) : false;
      const valid1 = sig1 ? timingSafeCompare(sig1, computed1) : false;

      if (valid256 || valid1) {
        signatureValid = true;
        break;
      }
    }

    if (!signatureValid) {
      l.warn('Invalid webhook signature', { delivery });
      return new Response('Invalid signature', { status: 401 });
    }
  } else if (!repoRecord) {
    l.warn('Repo not found in DB, skipping signature verification', { delivery, hookId: parsedBody?.hook_id, fullName: parsedBody?.repository?.full_name });
  } else if (candidateSecrets.length === 0) {
    l.warn('No webhook secret found', { delivery });
  }

  const now = Date.now();
  if (delivery && registerAndCheckDuplicate(processedDeliveries, delivery, DELIVERY_TTL_MS, now)) {
    l.info("Skipping duplicate webhook delivery", { delivery, event });
    return new Response(JSON.stringify({ handled: true, skipped: "duplicate_delivery" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (event === 'ping') {
    l.info('Received ping', { delivery });
    return new Response(JSON.stringify({ ok: true, message: 'pong' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const hasCodeTurtleMention = (text: string) =>
    /(^|\s)@(?:codeturtle|codeturtle-bot(?:\[bot\])?)(?=\s|$|[.,!?;:()])/i.test(text);

  if (event === 'pull_request') {
    try {
      const action = parsedBody?.action;
      const repoFullName = parsedBody?.repository?.full_name;
      const prNumber = parsedBody?.pull_request?.number;
      const headSha = parsedBody?.pull_request?.head?.sha || "";
      const owner = parsedBody?.repository?.owner?.login || repoRecord?.owner;
      const repo = parsedBody?.repository?.name || repoRecord?.name;
      const userId = repoRecord?.userId;

      l.info('Received pull_request event', { action, repo: repoFullName, prNumber, delivery });

      if ((action === 'opened' || action === 'synchronize') && owner && repo && prNumber && userId) {
        const eventKey = `${event}:${action}:${owner}/${repo}#${prNumber}:${headSha || "no-sha"}`;
        if (registerAndCheckDuplicate(processedEventKeys, eventKey, EVENT_TTL_MS, now)) {
          l.info("Skipping duplicate PR event (event-key cache)", { owner, repo, prNumber, action, headSha, delivery });
          return new Response(JSON.stringify({ handled: true, skipped: "event_key_duplicate" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (action === 'synchronize' || action === "opened") {
          const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
          const recentReview = await prisma.codeReview.findFirst({
            where: {
              userId,
              owner,
              repo,
              prNumber,
              createdAt: { gte: twoMinutesAgo },
            },
            select: { id: true },
          });

          if (recentReview) {
            l.info('Skipping duplicate PR event (recent review debounce)', { owner, repo, prNumber, action, delivery });
            return new Response(JSON.stringify({ handled: true, skipped: 'debounced' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }

        await inngest.send({
          name: 'pull_request.opened',
          data: { owner, repo, prNumber, userId, action, headSha },
        });
        l.info('Enqueued PR review', { owner, repo, prNumber });
      }
    } catch (err) {
      l.error('Error handling pull_request event', err as Error, { delivery });
    }
  }

  if (event === 'issue_comment') {
    try {
      const action = parsedBody?.action;
      const owner = parsedBody?.repository?.owner?.login || repoRecord?.owner;
      const repo = parsedBody?.repository?.name || repoRecord?.name;
      const prNumber = parsedBody?.issue?.number;
      const userId = repoRecord?.userId;
      const commentId = parsedBody?.comment?.id;
      const commentBody = parsedBody?.comment?.body || "";
      const senderLogin = parsedBody?.sender?.login || "";
      const senderType = (parsedBody?.sender?.type || "").toLowerCase();
      const isPRComment = Boolean(parsedBody?.issue?.pull_request);
      const hasMention = hasCodeTurtleMention(commentBody);
      const isBotSender = senderType === "bot" || /codeturtle/i.test(senderLogin);

      l.info('Received issue_comment event', {
        action,
        owner,
        repo,
        prNumber,
        commentId,
        senderLogin,
        isPRComment,
        hasMention,
        delivery,
      });

      if ((action === "created" || action === "edited") && owner && repo && prNumber && userId && commentId && isPRComment && hasMention && !isBotSender) {
        const mentionEventKey = `mention:issue_comment:${owner}/${repo}#${prNumber}:${commentId}:${shortHash(commentBody)}`;
        if (registerAndCheckDuplicate(processedEventKeys, mentionEventKey, EVENT_TTL_MS, now)) {
          l.info("Skipping duplicate mention event (issue_comment)", { owner, repo, prNumber, commentId, action, delivery });
          return new Response(JSON.stringify({ handled: true, skipped: "event_key_duplicate" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        await inngest.send({
          name: "pull_request.mention",
          data: {
            owner,
            repo,
            prNumber,
            userId,
            commentId,
            commentBody,
            senderLogin,
            source: "issue_comment",
          },
        });
        l.info("Enqueued @codeturtle mention response", { owner, repo, prNumber, commentId, action });
      }
    } catch (err) {
      l.error("Error handling issue_comment event", err as Error, { delivery });
    }
  }

  if (event === "pull_request_review_comment") {
    try {
      const action = parsedBody?.action;
      const owner = parsedBody?.repository?.owner?.login || repoRecord?.owner;
      const repo = parsedBody?.repository?.name || repoRecord?.name;
      const prNumber = parsedBody?.pull_request?.number;
      const userId = repoRecord?.userId;
      const commentId = parsedBody?.comment?.id;
      const commentBody = parsedBody?.comment?.body || "";
      const senderLogin = parsedBody?.sender?.login || "";
      const senderType = (parsedBody?.sender?.type || "").toLowerCase();
      const hasMention = hasCodeTurtleMention(commentBody);
      const isBotSender = senderType === "bot" || /codeturtle/i.test(senderLogin);

      l.info("Received pull_request_review_comment event", {
        action,
        owner,
        repo,
        prNumber,
        commentId,
        senderLogin,
        hasMention,
        delivery,
      });

      if ((action === "created" || action === "edited") && owner && repo && prNumber && userId && commentId && hasMention && !isBotSender) {
        const mentionEventKey = `mention:review_comment:${owner}/${repo}#${prNumber}:${commentId}:${shortHash(commentBody)}`;
        if (registerAndCheckDuplicate(processedEventKeys, mentionEventKey, EVENT_TTL_MS, now)) {
          l.info("Skipping duplicate mention event (pull_request_review_comment)", { owner, repo, prNumber, commentId, action, delivery });
          return new Response(JSON.stringify({ handled: true, skipped: "event_key_duplicate" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        await inngest.send({
          name: "pull_request.mention",
          data: {
            owner,
            repo,
            prNumber,
            userId,
            commentId,
            commentBody,
            senderLogin,
            source: "review_comment",
          },
        });
        l.info("Enqueued @codeturtle mention response from review comment", { owner, repo, prNumber, commentId, action });
      }
    } catch (err) {
      l.error("Error handling pull_request_review_comment event", err as Error, { delivery });
    }
  }

  if (event === "pull_request_review") {
    try {
      const action = parsedBody?.action;
      const owner = parsedBody?.repository?.owner?.login || repoRecord?.owner;
      const repo = parsedBody?.repository?.name || repoRecord?.name;
      const prNumber = parsedBody?.pull_request?.number;
      const userId = repoRecord?.userId;
      const reviewId = parsedBody?.review?.id;
      const reviewBody = parsedBody?.review?.body || "";
      const senderLogin = parsedBody?.sender?.login || "";
      const senderType = (parsedBody?.sender?.type || "").toLowerCase();
      const hasMention = hasCodeTurtleMention(reviewBody);
      const isBotSender = senderType === "bot" || /codeturtle/i.test(senderLogin);

      l.info("Received pull_request_review event", {
        action,
        owner,
        repo,
        prNumber,
        reviewId,
        senderLogin,
        hasMention,
        delivery,
      });

      if ((action === "submitted" || action === "edited") && owner && repo && prNumber && userId && reviewId && hasMention && !isBotSender) {
        const mentionEventKey = `mention:review:${owner}/${repo}#${prNumber}:${reviewId}:${shortHash(reviewBody)}`;
        if (registerAndCheckDuplicate(processedEventKeys, mentionEventKey, EVENT_TTL_MS, now)) {
          l.info("Skipping duplicate mention event (pull_request_review)", { owner, repo, prNumber, reviewId, action, delivery });
          return new Response(JSON.stringify({ handled: true, skipped: "event_key_duplicate" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        await inngest.send({
          name: "pull_request.mention",
          data: {
            owner,
            repo,
            prNumber,
            userId,
            commentId: reviewId,
            commentBody: reviewBody,
            senderLogin,
            source: "review_body",
          },
        });
        l.info("Enqueued @codeturtle mention response from pull_request_review", { owner, repo, prNumber, reviewId, action });
      }
    } catch (err) {
      l.error("Error handling pull_request_review event", err as Error, { delivery });
    }
  }

  return new Response(JSON.stringify({ handled: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
