import "server-only";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

/**
 * Admin allowlist - completely separate from SPECIAL_LIMITLESS_USERS.
 * A special-limitless user (unlimited usage) is NOT an admin unless their
 * name/email/GitHub account id (or comma-separated list of those) appears in
 * ADMIN_USERS. Example:
 *   ADMIN_USERS="ansh-dhanani,ops@example.com"
 */
export function getAdminIdentifiers(): string[] {
  return (process.env.ADMIN_USERS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminIdentifierMatch(candidate: string | null | undefined, identifiers: string[]): boolean {
  const normalized = (candidate || "").trim().toLowerCase();
  if (!normalized || identifiers.length === 0) return false;
  return identifiers.includes(normalized);
}

/** Async check that matches name, email, email local-part and GitHub accountId. */
export async function isAdminUser(userId: string): Promise<boolean> {
  const identifiers = getAdminIdentifiers();
  if (identifiers.length === 0) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      accounts: { select: { providerId: true, accountId: true } },
    },
  });
  if (!user) return false;

  const githubAccountId = user.accounts.find((account) => account.providerId === "github")?.accountId;
  const emailLocalPart = user.email?.split("@")[0];

  return [user.name, user.email, emailLocalPart, githubAccountId].some((value) =>
    isAdminIdentifierMatch(value, identifiers),
  );
}

export type AdminPrincipal = { id: string; email: string; name: string };

/**
 * Server-side guard for admin-only pages/actions. Throws on denial — callers
 * either let it bubble (error boundary) or convert to notFound().
 */
export async function requireAdmin(): Promise<AdminPrincipal> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new Error("Admin access required");
  }

  const isAdmin = await isAdminUser(session.user.id);
  if (!isAdmin) {
    throw new Error("Admin access required");
  }

  return {
    id: String(session.user.id),
    email: String(session.user.email ?? ""),
    name: String((session.user as { name?: string }).name ?? "Admin"),
  };
}
