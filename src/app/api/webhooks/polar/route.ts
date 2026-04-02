import { NextResponse } from "next/server";
import crypto from "crypto";
import { handlePolarSubscriptionEvent } from "@/lib/billing.server";
import { logger } from "@/lib/logger";

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
  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;

  const rawBody = await req.text();
  const sigHeader = req.headers.get("x-polar-signature") || "";

  if (webhookSecret && sigHeader) {
    const computed = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    if (!timingSafeCompare(sigHeader, computed)) {
      logger.warn("Invalid Polar webhook signature");
      return new NextResponse("Invalid signature", { status: 401 });
    }
  }

  let payload: { type?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  if (!payload.type) {
    return new NextResponse("Missing event type", { status: 400 });
  }

  try {
    await handlePolarSubscriptionEvent({
      type: payload.type,
      data: (payload.data || {}) as Record<string, unknown>,
    });
  } catch (error) {
    logger.error("Error processing Polar webhook", error as Error, { type: payload.type });
    return new NextResponse("Processing error", { status: 500 });
  }

  return NextResponse.json({ received: true });
}
