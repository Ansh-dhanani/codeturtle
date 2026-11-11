'use client'

import { useState } from 'react'
import { GithubIcon } from "@/components/github-icon";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { ChevronLeftIcon } from "lucide-react";
import Link from "next/link";
import { authenticateWithGithub } from '@/utils/auth';
import { safeNextPath } from '@/utils/auth';
import { Spinner } from '@/components/ui/spinner';
import { trackEvent, AnalyticsEvents } from '@/lib/analytics';

export function AuthPage() {
  const [isLoading, setIsLoading] = useState(false)

  const handleGithubSignin = async () => {
    setIsLoading(true)
    trackEvent(AnalyticsEvents.githubSignIn)
    try {
      const next = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('next')
        : null;
      const nextPath = safeNextPath(next);
      await authenticateWithGithub(nextPath)
    } catch {
      // No toast - keep the login screen clean
      setIsLoading(false)
    }
  }

  return (
    <div className="relative w-full md:h-screen md:overflow-hidden">
      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-8">
        <Button asChild className="absolute top-4 left-4" variant="ghost">
          <Link href="/">
            <ChevronLeftIcon data-icon="inline-start" />
            Home
          </Link>
        </Button>

        <div className="mx-auto space-y-4 sm:w-sm">
          <BrandMark className="h-10 w-auto" />
          <div className="flex flex-col space-y-1">
            <h1 className="font-bold font-brand text-2xl tracking-wide">
              Sign in or join now!
            </h1>
            <p className="text-base text-muted-foreground">
              Sign in with your GitHub account to get started with CodeTurtle.
            </p>
          </div>
          <div className="space-y-2">
            <Button
              className="w-full"
              type="button"
              onClick={handleGithubSignin}
              disabled={isLoading}
            >
              {isLoading ? <Spinner /> : <GithubIcon data-icon="inline-start" />}
              Continue with GitHub
            </Button>
          </div>
          <p className="mt-8 text-muted-foreground text-sm">
            By clicking continue, you agree to our{" "}
            <Link
              className="underline underline-offset-4 hover:text-primary"
              href="/terms"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              className="underline underline-offset-4 hover:text-primary"
              href="/privacy"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
