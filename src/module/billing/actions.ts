"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getAppBaseUrl, getPolarClient, getPolarProductId } from "@/lib/polar";

const PAID_PLANS = new Set(["pro", "enterprise"]);

export async function startCheckout(plan: string): Promise<{ url: string }> {
  const normalized = plan.trim().toLowerCase();
  if (!PAID_PLANS.has(normalized)) {
    throw new Error("Unknown plan");
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("User not authenticated");
  }

  const polar = getPolarClient();
  if (!polar) {
    throw new Error("Billing is not configured yet");
  }

  const productId = getPolarProductId(normalized);
  if (!productId) {
    throw new Error("This plan isn't available yet - please try again later");
  }

  const baseUrl = getAppBaseUrl();

  const checkout = await polar.checkouts.create({
    products: [productId],
    external_customer_id: session.user.id,
    customer_email: session.user.email ?? undefined,
    success_url: `${baseUrl}/billing?upgrade=success`,
    return_url: `${baseUrl}/billing`,
    // Copied to the created subscription so the webhook can map plan -> user
    metadata: { userId: session.user.id, plan: normalized },
  });

  if (!checkout.url) {
    throw new Error("Checkout could not be created");
  }

  return { url: checkout.url };
}

/** Opens the Polar customer portal for the signed-in user. */
export async function openCustomerPortal(): Promise<{ url: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("User not authenticated");
  }

  const polar = getPolarClient();
  if (!polar) {
    throw new Error("Billing is not configured yet");
  }

  const customerSession = await polar.customerSessions.create({
    external_customer_id: session.user.id,
    return_url: `${getAppBaseUrl()}/billing`,
  });

  if (!customerSession.customer_portal_url) {
    throw new Error("Customer portal could not be created");
  }

  return { url: customerSession.customer_portal_url };
}
