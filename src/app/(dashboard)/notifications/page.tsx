"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getReviews } from "@/module/review/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, CheckCircle2, AlertCircle, GitPullRequest } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function NotificationsPage() {
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["notifications-full"],
    queryFn: async () => await getReviews({ limit: 50 }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bell className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold leading-none tracking-tight">Notifications</h1>
          <p className="mt-1 text-xs text-muted-foreground">Recent review outcomes from your connected repositories.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Activity feed</CardTitle>
          <CardDescription className="text-xs">Completed and failed reviews sorted newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
          )}
          {!isLoading && reviews.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BellOff className="h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium">No notifications yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Connect a repository and open a PR — you&apos;ll see the review here.</p>
            </div>
          )}
          <ul className="divide-y">
            {reviews.map((review) => {
              const files = review.files as { overallScore?: number; issues?: unknown[] } | null | undefined;
              const score = files?.overallScore;
              const issues = Array.isArray(files?.issues) ? files!.issues!.length : 0;
              const ok = review.status === "completed";
              return (
                <li key={review.id} className="flex items-start gap-3 py-3">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${ok ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-500"}`}>
                    {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link href="/reviews" className="font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline">
                        {review.owner}/{review.repo} #{review.prNumber}
                      </Link>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm">{review.prTitle ?? (ok ? "Review completed" : "Review failed")}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <Badge variant={ok ? "secondary" : "outline"} className="text-[10px]">{ok ? "Completed" : "Failed"}</Badge>
                      {typeof score === "number" && <span>Score {score}/10</span>}
                      {issues > 0 && <span>{issues} issue{issues === 1 ? "" : "s"}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
