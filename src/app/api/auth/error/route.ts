import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL || url.origin;

  if (state === "state_not_found") {
    try {
      const session = await auth.api.getSession({
        headers: request.headers,
      });

      if (session?.user) {
        return NextResponse.redirect(new URL("/dashboard", appOrigin));
      }
    } catch {
      // If session lookup fails, continue to login fallback.
    }

    return NextResponse.redirect(new URL("/login?authError=state_not_found", appOrigin));
  }

  return NextResponse.redirect(new URL("/login?authError=oauth_error", appOrigin));
}
