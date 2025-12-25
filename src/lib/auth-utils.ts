import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export async function getSession() {
  return await auth.api.getSession({ headers: await headers() });
}

export async function isAuthenticated() {
  const session = await auth.api.getSession({ headers: await headers() });
  return !!session;
}

export async function requireAuth() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }
  return session;
}