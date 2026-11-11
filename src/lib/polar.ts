import "server-only";
import { createPolar } from "@polar-sh/sdk/2026-10";

let cached: ReturnType<typeof createPolar> | null = null;

/** Returns null when billing isn't configured yet. */
export function getPolarClient() {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) return null;
  if (!cached) {
    const environment = process.env.POLAR_ENVIRONMENT === "sandbox" ? "sandbox" : "production";
    cached = createPolar({
      accessToken,
      environment,
      ...(process.env.POLAR_SERVER_URL ? { baseUrl: process.env.POLAR_SERVER_URL } : {}),
    });
  }
  return cached;
}

/** Product ids for each paid plan, from env. Returns undefined when not configured. */
export function getPolarProductId(plan: string): string | undefined {
  const map: Record<string, string | undefined> = {
    pro: process.env.POLAR_PRODUCT_PRO_ID,
    enterprise: process.env.POLAR_PRODUCT_ENTERPRISE_ID,
  };
  return map[plan]?.trim() || undefined;
}

export function getAppBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}
