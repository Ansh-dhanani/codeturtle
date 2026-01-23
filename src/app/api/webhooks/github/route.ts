import prisma from '@/lib/prisma';
import crypto from 'crypto';

/**
 * Perform a timing-safe (constant-time) comparison of two strings.
 *
 * @param a - The first string to compare
 * @param b - The second string to compare
 * @returns `true` if the strings are equal, `false` otherwise. Returns `false` if the lengths differ or an error occurs during comparison.
 */
function timingSafeCompare(a: string, b: string) {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (_err) {
    return false;
  }
}

/**
 * Handle incoming GitHub webhook POST requests: verify HMAC signatures (using a repository-stored secret or GITHUB_WEBHOOK_SECRET), respond to pings, and perform basic dispatch for supported events (e.g., `pull_request`).
 *
 * @param req - The incoming HTTP request containing GitHub webhook headers and JSON payload
 * @returns An HTTP Response: `200` with JSON `{ handled: true }` for processed events, `200` with JSON `{ ok: true, message: 'pong' }` for ping events, or `401` with body `'Invalid signature'` when signature verification fails
 */
export async function POST(req: Request) {
  const event = (req.headers.get('x-github-event') || '').toLowerCase();
  const delivery = req.headers.get('x-github-delivery') || '';
  const sig256 = req.headers.get('x-hub-signature-256') || '';
  const sig1 = req.headers.get('x-hub-signature') || '';

  const buf = await req.arrayBuffer();
  const payload = Buffer.from(buf);

  let parsedBody: Record<string, unknown> | null;
  try {
    parsedBody = JSON.parse(payload.toString());
  } catch (err) {
    console.warn('Failed to parse webhook payload', err);
    parsedBody = null;
  }

  // Try to find the repository record to obtain the stored hook secret
  let repoRecord: { hookSecret: string } | null = null;
  try {
    if (parsedBody?.hook_id && typeof parsedBody.hook_id === 'number') {
      repoRecord = await prisma.repository.findFirst({ 
        where: { hookId: BigInt(parsedBody.hook_id) },
        select: { hookSecret: true }
      });
    }
    if (!repoRecord && parsedBody?.repository?.full_name) {
      repoRecord = await prisma.repository.findFirst({ where: { fullName: parsedBody.repository.full_name } });
    }
  } catch (err) {
    console.error('Error looking up repository for webhook:', err);
  }

  const secret = repoRecord?.hookSecret || process.env.GITHUB_WEBHOOK_SECRET;

  if (secret) {
    const computed256 = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const computed1 = 'sha1=' + crypto.createHmac('sha1', secret).update(payload).digest('hex');

    const valid256 = sig256 ? timingSafeCompare(sig256, computed256) : false;
    const valid1 = sig1 ? timingSafeCompare(sig1, computed1) : false;

    if (!valid256 && !valid1) {
      console.warn(`Invalid webhook signature for delivery ${delivery}`);
      return new Response('Invalid signature', { status: 401 });
    }
  } else {
    console.warn(`No webhook secret found for delivery ${delivery} - skipping signature verification`);
  }

  // Handle ping quickly
  if (event === 'ping') {
    console.log(`Received ping from GitHub (delivery=${delivery})`);
    return new Response(JSON.stringify({ ok: true, message: 'pong' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // Handle pull_request events (placeholder)
  if (event === 'pull_request') {
    try {
      const action = parsedBody?.action;
      const repo = parsedBody?.repository?.full_name;
      console.log(`Received pull_request event: action=${action} repo=${repo} delivery=${delivery}`);
      // TODO: implement PR processing (e.g., enqueue job, run checks, etc.)
    } catch (err) {
      console.error('Error handling pull_request event:', err);
    }
  }

  // Respond 200 for all known events after processing
  return new Response(JSON.stringify({ handled: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}