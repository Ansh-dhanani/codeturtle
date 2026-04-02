import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Github, Brain, Zap, Crown } from "lucide-react";
import { GithubConnectButton } from "@/components/settings/GithubConnectButton";
import ProfileForm from "@/components/pages/profile-form";
import { RepositoryList } from "@/components/github/repository-list";
import { AIModelSelector } from "@/components/settings/ai-model-selector";

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  let githubConnected = false;
  let userAiModel = "gemini-2.5-flash";
  let userAiProvider = "google";
  if (session) {
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        providerId: "github",
      },
    });
    githubConnected = !!account;
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { aiModel: true, aiProvider: true },
    });
    userAiModel = user?.aiModel || "gemini-2.5-flash";
    const userAiProvider = user?.aiProvider || "google";
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure your account and application settings
        </p>
      </div>

      <AIModelSelector currentProvider={userAiProvider} currentModel={userAiModel} />

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
      <div className="space-y-4">
          <ProfileForm />
      </div>
      <div className="space-y-4">
          <RepositoryList/>
      </div>
    </div>
  );
}
