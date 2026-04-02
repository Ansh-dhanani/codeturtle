import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getSubscriptionStatus } from "@/lib/billing.server";
import { createLogger } from "@/lib/logger";

const l = createLogger("api-billing");

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = await getSubscriptionStatus(session.user.id);

    return Response.json(status);
  } catch (err) {
    l.error("Error fetching billing info", err as Error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
