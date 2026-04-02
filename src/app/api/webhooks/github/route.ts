import prisma from '@/lib/prisma';
import crypto from 'crypto';
import { inngest } from '@/inngest/client';
import { createLogger } from '@/lib/logger';

const l = createLogger('webhook-github');

function timingSafeCompare(a: string, b: string) {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (err) {
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
    pull_request?: { number: number; title?: string; user?: { login?: string } };
    sender?: { login?: string };
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

  const secret = repoRecord?.hookSecret ?? process.env.GITHUB_WEBHOOK_SECRET;

  if (secret && repoRecord) {
    const computed256 = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const computed1 = 'sha1=' + crypto.createHmac('sha1', secret).update(payload).digest('hex');

    const valid256 = sig256 ? timingSafeCompare(sig256, computed256) : false;
    const valid1 = sig1 ? timingSafeCompare(sig1, computed1) : false;

    if (!valid256 && !valid1) {
      l.warn('Invalid webhook signature', { delivery });
      return new Response('Invalid signature', { status: 401 });
    }
  } else if (!repoRecord) {
    l.warn('Repo not found in DB, skipping signature verification', { delivery, hookId: parsedBody?.hook_id, fullName: parsedBody?.repository?.full_name });
  } else {
    l.warn('No webhook secret found', { delivery });
  }

  if (event === 'ping') {
    l.info('Received ping', { delivery });
    return new Response(JSON.stringify({ ok: true, message: 'pong' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (event === 'pull_request') {
    try {
      const action = parsedBody?.action;
      const repoFullName = parsedBody?.repository?.full_name;
      const prNumber = parsedBody?.pull_request?.number;
      const owner = parsedBody?.repository?.owner?.login || repoRecord?.owner;
      const repo = parsedBody?.repository?.name || repoRecord?.name;
      const userId = repoRecord?.userId;

      l.info('Received pull_request event', { action, repo: repoFullName, prNumber, delivery });

      if ((action === 'opened' || action === 'synchronize') && owner && repo && prNumber && userId) {
        await inngest.send({
          name: 'pull_request.opened',
          data: { owner, repo, prNumber, userId, action },
        });
        l.info('Enqueued PR review', { owner, repo, prNumber });
      }
    } catch (err) {
      l.error('Error handling pull_request event', err as Error, { delivery });
    }
  }

  return new Response(JSON.stringify({ handled: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}