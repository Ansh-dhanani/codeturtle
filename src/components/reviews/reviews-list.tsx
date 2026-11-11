"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getReviews } from "@/module/review/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileCode,
  GitPullRequest,
  Info,
  Lightbulb,
  Search,
  ThumbsUp,
  ThumbsDown,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";

type StatusFilter = "all" | "completed" | "failed" | "running";

function statusGroup(status: string): Exclude<StatusFilter, "all"> {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "running";
}

function StatusPill({ status }: { status: string }) {
  const group = statusGroup(status);
  if (group === "completed")
    return (
      <Badge variant="secondary" className="gap-1 text-[10px]">
        <CheckCircle2 className="h-3 w-3" /> Completed
      </Badge>
    );
  if (group === "failed")
    return (
      <Badge variant="outline" className="gap-1 text-[10px] text-rose-600 dark:text-rose-400 border-rose-500/30">
        <AlertCircle className="h-3 w-3" /> Failed
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1 text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30">
      <Info className="h-3 w-3" /> {status}
    </Badge>
  );
}

function FeedbackButtons({ reviewId, findingKey }: { reviewId: string; findingKey: string }) {
  const [sent, setSent] = useState<"up" | "down" | null>(null);

  const send = async (rating: 1 | -1) => {
    setSent(rating === 1 ? "up" : "down");
    trackEvent(AnalyticsEvents.feedbackGiven, { rating });
    try {
      const { submitReviewFeedback } = await import("@/module/review/actions");
      await submitReviewFeedback({ reviewId, findingKey, rating });
      toast.success(rating === 1 ? "Marked helpful" : "Marked as not helpful");
    } catch (error) {
      setSent(null);
      toast.error((error as Error).message || "Failed to submit feedback");
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        onClick={() => send(1)}
        disabled={sent !== null}
        aria-label="Helpful"
        title="Helpful"
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => send(-1)}
        disabled={sent !== null}
        aria-label="Not helpful"
        title="Not helpful"
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: "text-rose-500",
  warning: "text-amber-500",
  info: "text-sky-400",
};

function ScoreCell({ score, status }: { score: number; status: string }) {
  if (statusGroup(status) === "failed") {
    return (
      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
        <AlertCircle className="h-5 w-5" />
      </div>
    );
  }
  return (
    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
      <span className="text-base font-bold leading-none tabular-nums">{score}</span>
      <span className="text-[8px] uppercase tracking-wide text-primary/60">/10</span>
    </div>
  );
}

type Review = Awaited<ReturnType<typeof getReviews>>[number];

export default function ReviewsList({ initialRepoFullName }: { initialRepoFullName?: string }) {
  const [query, setQuery] = useState(initialRepoFullName ?? "");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: reviews, isLoading, error } = useQuery({
    queryKey: ["reviews", "list"],
    queryFn: async () => await getReviews({ limit: 50 }),
  });

  const enriched = useMemo(
    () =>
      (reviews ?? []).map((review) => {
        const files = review.files as Record<string, unknown> | null;
        const issues = (files?.issues as Array<{ severity: string; title: string; description: string; file: string; suggestion?: string }>) || [];
        const suggestions = (files?.suggestions as Array<{ title: string; description: string; file: string }>) || [];
        const positives = (files?.positives as string[]) || [];
        const score = (files?.overallScore as number) || 0;
        return { review, issues, suggestions, positives, score };
      }),
    [reviews],
  );

  const counts = useMemo(
    () => ({
      all: enriched.length,
      completed: enriched.filter(({ review }) => statusGroup(review.status) === "completed").length,
      failed: enriched.filter(({ review }) => statusGroup(review.status) === "failed").length,
      running: enriched.filter(({ review }) => statusGroup(review.status) === "running").length,
    }),
    [enriched],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter(({ review }) => {
      if (status !== "all" && statusGroup(review.status) !== status) return false;
      if (!q) return true;
      const haystack = `${review.owner}/${review.repo} pr#${review.prNumber} ${review.prNumber} ${review.prTitle ?? ""}`.toLowerCase();
      return q.split(/\s+/).every((token) => haystack.includes(token));
    });
  }, [enriched, query, status]);

  const statusPills: Array<{ id: StatusFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "completed", label: "Completed" },
    { id: "failed", label: "Failed" },
    { id: "running", label: "In progress" },
  ];

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <GitPullRequest className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-none tracking-tight">Reviews</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {enriched.length} review{enriched.length === 1 ? "" : "s"} across your repositories
            </p>
          </div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search repo, PR # or title…"
            aria-label="Search reviews"
            className="h-9 pl-9"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1 rounded-lg border p-1">
          {statusPills.map((pill) => (
            <button
              key={pill.id}
              onClick={() => setStatus(pill.id)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                status === pill.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {pill.label}
              <span className={`ml-1 tabular-nums ${status === pill.id ? "opacity-80" : "opacity-60"}`}>
                {counts[pill.id]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── List ── */}
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      )}
      {error && (
        <Card><CardContent className="py-8 text-center text-sm text-rose-500">Failed to load reviews. Please try again.</CardContent></Card>
      )}
      {!isLoading && !error && filtered.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <FileCode className="h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium">
              {query || status !== "all" ? "No reviews match those filters." : "No reviews yet."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Open a pull request on a connected repository to trigger a review.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {filtered.map(({ review, issues, suggestions, positives, score }) => {
          const expanded = expandedId === review.id;
          const failed = statusGroup(review.status) === "failed";
          return (
            <div
              key={review.id}
              className={`overflow-hidden rounded-xl border bg-card transition-shadow ${expanded ? "shadow-sm" : "hover:border-primary/30"} ${failed ? "border-rose-500/20" : ""}`}
            >
              {/* Row */}
              <button
                onClick={() => setExpandedId(expanded ? null : review.id)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <ScoreCell score={score} status={review.status} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-mono text-xs text-muted-foreground">
                      {review.owner}/{review.repo}
                    </span>
                    <span className="text-xs font-medium text-foreground">
                      PR #{review.prNumber}
                    </span>
                    <span className="text-[10px] text-muted-foreground/70">
                      {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                    </span>
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-[11px] text-muted-foreground">
                    {review.summary || (failed ? "Review failed" : "No summary")}
                  </span>
                </span>
                <span className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                  <StatusPill status={review.status} />
                  <span className="text-[10px] text-muted-foreground/80 tabular-nums">
                    {issues.length} issue{issues.length === 1 ? "" : "s"} · {suggestions.length} sugg
                  </span>
                </span>
                {expanded
                  ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
              </button>

              {/* Expanded */}
              {expanded && (
                <div className="border-t bg-muted/20 px-4 py-3">
                  {review.summary && (
                    <p className="text-xs leading-relaxed text-muted-foreground">{review.summary}</p>
                  )}

                  {issues.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <AlertCircle className="h-3.5 w-3.5" /> Issues ({issues.length})
                      </p>
                      {issues.map((issue, idx) => (
                        <div key={idx} className="rounded-lg border bg-card p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-start gap-2">
                              <span className={`mt-0.5 text-xs font-bold uppercase ${SEVERITY_STYLE[issue.severity] ?? "text-muted-foreground"}`}>
                                {issue.severity?.slice(0, 4) ?? "info"}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-medium leading-snug">{issue.title || "Issue"}</p>
                                {issue.description && (
                                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{issue.description}</p>
                                )}
                              </div>
                            </div>
                            <FeedbackButtons
                              reviewId={review.id}
                              findingKey={`issue:${issue.file}:${issue.title}`}
                            />
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{issue.file}</code>
                          </div>
                          {issue.suggestion && (
                            <p className="mt-1.5 border-l-2 border-primary/30 pl-2 text-[11px] leading-snug text-muted-foreground">
                              <span className="font-medium text-foreground">Fix:</span> {issue.suggestion}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {suggestions.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <Lightbulb className="h-3.5 w-3.5" /> Suggestions ({suggestions.length})
                      </p>
                      {suggestions.map((s, idx) => (
                        <div key={idx} className="flex items-start justify-between gap-2 rounded-lg border bg-card p-2.5">
                          <div className="min-w-0">
                            <p className="text-xs font-medium leading-snug">{s.title}</p>
                            {s.description && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{s.description}</p>}
                            <code className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{s.file}</code>
                          </div>
                          <FeedbackButtons
                            reviewId={review.id}
                            findingKey={`suggestion:${s.file}:${s.title}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {positives.length > 0 && (
                    <div className="mt-3">
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <ThumbsUp className="h-3.5 w-3.5" /> Positives
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11px] text-muted-foreground">
                        {positives.slice(0, 4).map((p, idx) => <li key={idx}>{p}</li>)}
                      </ul>
                    </div>
                  )}

                  {review.status === "completed" && review.prNumber && (
                    <div className="mt-3 flex justify-end border-t pt-2.5">
                      <button
                        onClick={async () => {
                          trackEvent(AnalyticsEvents.fixPrRequested);
                          try {
                            const { generateFixPR } = await import("@/module/review/actions");
                            const result = await generateFixPR(review.id);
                            toast.success(`Fix PR created: #${result.prNumber}`);
                          } catch (error) {
                            toast.error((error as Error).message || "Failed to generate fix PR");
                          }
                        }}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Generate Fix PR →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
