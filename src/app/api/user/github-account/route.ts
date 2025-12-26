import { NextResponse } from "next/server";
import { auth, prisma } from "@/lib/auth";
import { headers } from "next/headers";
export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const githubAccount = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        providerId: "github",
      },
    });
    if (!githubAccount) {
      return NextResponse.json({ error: "No GitHub account linked" }, { status: 404 });
    }
    return NextResponse.json({
      id: githubAccount.id,
      providerId: githubAccount.providerId,
      accountId: githubAccount.accountId,
    });
  } catch (error) {
    console.error("Error checking GitHub account:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
