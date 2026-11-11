"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getReviews } from "@/module/review/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";
import {
  Bell,
  BellOff,
  CheckCircle2,
  AlertCircle,
  GitPullRequest,
  Star,
  ArrowRight,
} from "lucide-react";

const SEEN_KEY = "ct-notifications-seen";

type ReviewRow = {
  id: string;
  owner: string;
  repo: string;
  prNumber: number;
  prUrl: string | null;
  prTitle: string | null;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  files: unknown;
};

function getScore(files: unknown): number | null {
  if (files && typeof files === "object") {
    const s = (files as { overallScore?: unknown }).overallScore;
    return typeof s === "number" ? s : null;
  }
  return null;
}

function getIssues(files: unknown): number {
  if (files && typeof files === "object") {
    const issues = (files as { issues?: unknown }).issues;
    return Array.isArray(issues) ? issues.length : 0;
  }
  return 0;
}

export function NotificationsBell() {
  const router = useRouter();
  const [seenAt, setSeenAt] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const stored = window.localStorage.getItem(SEEN_KEY);
    return stored ? Number(stored) : 0;
  });
  const [open, setOpen] = useState(false);

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["notifications-reviews"],
    queryFn: async () => (await getReviews({ limit: 30 })) as unknown as ReviewRow[],
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const { items, unreadCount } = useMemo(() => {
    const filtered = reviews.slice(0, 20);
    const unread = filtered.filter((r) => new Date(r.createdAt).getTime() > seenAt).length;
    return { items: filtered, unreadCount: unread };
  }, [reviews, seenAt]);

  const markAllRead = useCallback(() => {
    const now = Date.now();
    setSeenAt(now);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SEEN_KEY, String(now));
    }
  }, []);

  // Keep seen state fresh if another tab updates it
  useEffect(() => {
    const handler = () => {
      const stored = window.localStorage.getItem(SEEN_KEY);
      if (stored) setSeenAt(Number(stored));
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return (
    <Popover open={open} onOpenChange={(isOpen) => { if (isOpen) trackEvent(AnalyticsEvents.notificationsOpened); setOpen(isOpen); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 p-0" sideOffset={8}>
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px] tabular-nums">
                {unreadCount} new
              </Badge>
            )}
          </div>
          <button
            onClick={markAllRead}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Mark all read
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isLoading && <div className="px-4 py-8 text-center text-xs text-muted-foreground">Loading…</div>}
          {!isLoading && items.length === 0 && (
            <div className="px-4 py-8 text-center">
              <BellOff className="mx-auto h-6 w-6 text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium">No notifications yet</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Your review activity will appear here.</p>
            </div>
          )}
          <ul className="divide-y">
            {items.map((review) => {
              const unread = new Date(review.createdAt).getTime() > seenAt;
              const score = getScore(review.files);
              const issues = getIssues(review.files);
              const ok = review.status === "completed";
              return (
                <li key={review.id}>
                  <button
                    onClick={() => {
                      setOpen(false);
                      router.push("/reviews");
                    }}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left outline-none transition hover:bg-muted/50"
                  >
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${ok ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-500"}`}>
                      {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                          {review.owner}/{review.repo} #{review.prNumber}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs">
                        {review.prTitle ?? (ok ? "Review completed" : "Review failed")}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{ok ? "Completed" : "Failed"}</span>
                        {typeof score === "number" && <span>· Score {score}/10</span>}
                        {issues > 0 && <span>· {issues} issue{issues === 1 ? "" : "s"}</span>}
                      </div>
                    </div>
                    {unread && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex items-center justify-between border-t px-4 py-2.5">
          <span className="text-[10px] text-muted-foreground">Most recent activity, including failed reviews</span>
          <Link href="/notifications" onClick={() => setOpen(false)} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            See all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
