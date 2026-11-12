import "server-only";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";

/**
 * Admin allowlist - completely separate from SPECIAL_LIMITLESS_USERS.
 * A special-limitless user (unlimited usage) is NOT an admin unless their
 * email is also in ADMIN_USERS. Example:
 *   ADMIN_USERS="owner@gmail.com,ops@example.com"
 */
export function getAdminEmails(): string[] {
  return (process.env.ADMIN_USERS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null): boolean {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return false;
  return getAdminEmails().includes(normalized);
}

export type AdminPrincipal = { id: string; email: string; name: string };

/**
 * Server-side guard for admin-only pages/actions. Throws on denial — callers
 * either let it bubble (error boundary) or convert to notFound().
 */
export async function requireAdmin(): Promise<AdminPrincipal> {
  const session = await auth.api.getSession({ headers: await headers() });
  const email = session?.user?.email ?? null;
  if (!session || !isAdminEmail(email)) {
    throw new Error("Admin access required");
  }
  return {
    id: String(session.user.id),
    email: String(session.user.email),
    name: String((session.user as { name?: string }).name ?? "Admin"),
  };
}
