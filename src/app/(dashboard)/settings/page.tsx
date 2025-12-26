import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Github } from "lucide-react";
import { GithubConnectButton } from "@/components/settings/GithubConnectButton";

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  let githubConnected = false;
  if (session) {
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        providerId: "github",
      },
    });
    githubConnected = !!account;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure your account and application settings
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            GitHub Integration
          </CardTitle>
          <CardDescription>
            Connect your GitHub account to view contribution data and statistics.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {githubConnected ? (
            <div className="flex items-center gap-2 text-green-600">
              <Github className="h-4 w-4" />
              GitHub account connected
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                GitHub account not connected. Connect to view your contribution data.
              </p>
              <GithubConnectButton />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
