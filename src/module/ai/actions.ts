"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getLiveCatalog, applyPlanGate, type CatalogProvider } from "@/lib/ai-catalog";

export type AvailableProvider = CatalogProvider;
export type AvailableModel = CatalogProvider["models"][number];

async function isPaidUser(userId: string): Promise<boolean> {
  try {
    const { canUsePaidModels } = await import("@/lib/billing.server");
    return await canUsePaidModels(userId);
  } catch {
    // Fail closed - treat as free on error
    return false;
  }
}

export async function getAvailableProviders(): Promise<AvailableProvider[]> {
  const session = await auth.api.getSession({ headers: await headers() });
  const catalog = await getLiveCatalog();
  if (!session?.user) return applyPlanGate(catalog, false);
  return applyPlanGate(catalog, await isPaidUser(session.user.id));
}

export async function refreshAvailableProviders(): Promise<AvailableProvider[]> {
  const session = await auth.api.getSession({ headers: await headers() });
  const catalog = await getLiveCatalog(true);
  if (!session?.user) return applyPlanGate(catalog, false);
  return applyPlanGate(catalog, await isPaidUser(session.user.id));
}
