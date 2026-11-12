"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getAppBaseUrl, getPolarClient, getPolarProductId } from "@/lib/polar";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const PAID_PLANS = new Set(["pro", "enterprise"]);

export async function startCheckout(plan: string): Promise<ActionResult<{ url: string }>> {
  try {
    const normalized = plan.trim().toLowerCase();
    if (!PAID_PLANS.has(normalized)) {
      return { ok: false, error: "Unknown plan." };
    }

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { ok: false, error: "Sign in to upgrade." };
    }

    const polar = getPolarClient();
    if (!polar) {
      console.error("[billing] POLAR_ACCESS_TOKEN is not set; checkout unavailable");
      return { ok: false, error: "Upgrades are temporarily disabled. If you want Pro, email dhananiansh01@gmail.com and we'll enable it for you." };
    }

    const productId = getPolarProductId(normalized);
    if (!productId) {
      console.error(`[billing] POLAR_PRODUCT_${normalized.toUpperCase()}_ID is not set`);
      return { ok: false, error: "Upgrades are temporarily disabled. If you want Pro, email dhananiansh01@gmail.com and we'll enable it for you." };
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
      console.error("[billing] polar returned checkout without url");
      return { ok: false, error: "Polar didn't return a checkout URL. Try again in a minute." };
    }

    return { ok: true, data: { url: checkout.url } };
  } catch (error) {
    console.error("[billing] startCheckout failed:", error instanceof Error ? error.message : error);
    return { ok: false, error: "Couldn't start checkout. Try again in a minute." };
  }
}

/** Opens the Polar customer portal for the signed-in user. */
export async function openCustomerPortal(): Promise<ActionResult<{ url: string }>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { ok: false, error: "Sign in first." };
    }

    const polar = getPolarClient();
    if (!polar) {
      console.error("[billing] POLAR_ACCESS_TOKEN is not set; customer portal unavailable");
      return { ok: false, error: "Manage-plan is temporarily unavailable - email dhananiansh01@gmail.com and we'll help." };
    }

    const customerSession = await polar.customerSessions.create({
      external_customer_id: session.user.id,
      return_url: `${getAppBaseUrl()}/billing`,
    });

    if (!customerSession.customer_portal_url) {
      console.error("[billing] polar returned customer session without portal url");
      return { ok: false, error: "Couldn't open the customer portal." };
    }

    return { ok: true, data: { url: customerSession.customer_portal_url } };
  } catch (error) {
    console.error("[billing] openCustomerPortal failed:", error instanceof Error ? error.message : error);
    return { ok: false, error: "Couldn't open the customer portal. Try again in a minute." };
  }
}
