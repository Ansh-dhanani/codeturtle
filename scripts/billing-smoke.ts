/**
 * Billing smoke test: proves a paid subscription activates (and cancels back)
 * through the same code path the real Polar webhook uses.
 *
 *   bun run test:billing
 *
 * Creates a scratch user, signs a `subscription.created` event with a test secret,
 * verifies through the real Standard Webhooks validator, runs the handler,
 * checks the DB subscription state, then cleans up.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import crypto from "node:crypto";

const SECRET = process.env.POLAR_WEBHOOK_SECRET ?? "whsec_test_secret_for_e2e_simulation";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function sign(webhookId: string, timestamp: number, body: string) {
  return crypto.createHmac("sha256", SECRET).update(`${webhookId}.${timestamp}.${body}`).digest("base64");
}

async function main() {
  const email = "billing-smoke@codeturtle.dev";
  await prisma.subscription.deleteMany({ where: { user: { email } } });
  await prisma.user.deleteMany({ where: { email } });

  const user = await prisma.user.create({
    data: { id: crypto.randomUUID(), name: "Billing Smoke", email, emailVerified: true },
  });
  console.log("OK scratch user:", user.id);

  const { webhooks } = await import("@polar-sh/sdk/2026-10");
  const { handlePolarSubscriptionEvent } = await import("../src/lib/billing.server");

  const body = JSON.stringify({
    type: "subscription.created",
    data: {
      subscription_id: "sub_smoke_123",
      customer_id: "cus_smoke_123",
      metadata: { userId: user.id, plan: "pro" },
      status: "active",
      current_period_end: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    },
  });
  const webhookId = `msg_smoke_${Date.now()}`;
  const timestamp = Math.floor(Date.now() / 1000);

  const event = await webhooks.validateEvent(
    body,
    {
      "webhook-id": webhookId,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${sign(webhookId, timestamp, body)}`,
    },
    SECRET,
  );
  console.log("OK signature validation passed");

  type HandlerArg = Parameters<typeof handlePolarSubscriptionEvent>[0];
  const toHandler = (type: string, data: unknown): HandlerArg =>
    ({ type, data }) as unknown as HandlerArg;
  await handlePolarSubscriptionEvent(toHandler(event.type, event.data));
  const active = await prisma.subscription.findUnique({ where: { userId: user.id } });
  if (active?.plan !== "pro" || active?.usageLimit !== 100) {
    throw new Error(`FAIL: expected plan=pro/usageLimit=100, got plan=${active?.plan}/${active?.usageLimit}`);
  }
  console.log(`OK subscription.created -> plan=${active.plan}, usageLimit=${active.usageLimit}`);

  await handlePolarSubscriptionEvent({
    type: "subscription.canceled",
    data: { subscription_id: "sub_smoke_123", metadata: { userId: user.id, plan: "pro" }, status: "canceled" },
  });
  const canceled = await prisma.subscription.findUnique({ where: { userId: user.id } });
  if (canceled?.plan !== "free" || canceled?.usageLimit !== 20) {
    throw new Error(`FAIL: expected plan=free/usageLimit=20, got ${canceled?.plan}/${canceled?.usageLimit}`);
  }
  console.log(`OK subscription.canceled -> plan=${canceled.plan}, usageLimit=${canceled.usageLimit}`);

  await prisma.subscription.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  console.log("OK cleanup done — billing path is working");
}

main()
  .catch((err) => {
    console.error("FAIL", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
