import { NextResponse } from "next/server";
import { webhooks } from "@polar-sh/sdk/2026-10";
import { handlePolarSubscriptionEvent } from "@/lib/billing.server";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;

  // Fail closed - never process billing events without a verified signature.
  if (!webhookSecret) {
    logger.error("POLAR_WEBHOOK_SECRET is not configured; rejecting webhook call");
    return new NextResponse("Billing not configured", { status: 503 });
  }

  const rawBody = await req.text();

  let event: { type: string; data: Record<string, unknown> };
  try {
    event = webhooks.validateEvent(
      rawBody,
      {
        "webhook-id": req.headers.get("webhook-id") ?? "",
        "webhook-timestamp": req.headers.get("webhook-timestamp") ?? "",
        "webhook-signature": req.headers.get("webhook-signature") ?? "",
      },
      webhookSecret,
    ) as unknown as { type: string; data: Record<string, unknown> };
  } catch (error) {
    if (error instanceof webhooks.PolarWebhookUnknownTypeError) {
      // Event type added after this SDK version - acknowledge so Polar doesn't retry.
      return NextResponse.json({ received: true, handled: false });
    }
    logger.warn("Invalid Polar webhook signature");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  try {
    await handlePolarSubscriptionEvent({
      type: event.type,
      data: (event.data || {}) as Record<string, unknown>,
    });
  } catch (error) {
    logger.error("Error processing Polar webhook", error as Error, { type: event.type });
    return new NextResponse("Processing error", { status: 500 });
  }

  return NextResponse.json({ received: true, handled: true });
}
