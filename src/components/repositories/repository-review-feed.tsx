"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FileCode, Info, ThumbsUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { cn } from "@/lib/utils";

type ReviewData = {
  id: string;
  prNumber: number;
  prTitle: string | null;
  prUrl: string | null;
  sha: string | null;
  summary: string | null;
  files: unknown;
  status: string;
  createdAt: Date;
};

type Issue = {
  severity?: string;
  title?: string;
  description?: string;
  file?: string;
  line?: number;
  suggestion?: string;
};

type Suggestion = {
  title?: string;
  description?: string;
  file?: string;
  codeBefore?: string;
  codeAfter?: string;
};

function safeUrl(url: string | null): string {
  if (!url) return "#";
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "#";
    return url;
  } catch {
    return "#";
  }
}

function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 8
      ? "border-green-500/30 text-green-600 dark:text-green-400"
      : score >= 5
        ? "border-yellow-500/30 text-yellow-600 dark:text-yellow-400"
        : "border-red-500/30 text-red-600 dark:text-red-400";
  return <Badge variant="outline" className={tone}>{score}/10</Badge>;
}

function SeverityBadge({ severity }: { severity?: string }) {
  if (severity === "critical") return <Badge variant="destructive">critical</Badge>;
  if (severity === "warning") return <Badge variant="secondary">warning</Badge>;
  return <Badge variant="outline">info</Badge>;
}

export function RepositoryReviewFeed({
  reviews,
  repoFullName,
}: {
  reviews: ReviewData[];
  repoFullName: string;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (reviews.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <FileCode className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">No reviews yet</h3>
          <p className="mt-2 text-muted-foreground">
            Review requests will appear here once GitHub triggers a review on a pull request.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          {reviews.length} review{reviews.length === 1 ? "" : "s"} for <span className="font-mono text-foreground">{repoFullName}</span>
        </h2>
      </div>
      {reviews.map((review) => {
        const files = review.files as Record<string, unknown> | null;
        const issues = ((files?.issues as unknown[]) || []) as Issue[];
        const suggestions = ((files?.suggestions as unknown[]) || []) as Suggestion[];
        const positives = (files?.positives as string[]) || [];
        const score = (files?.overallScore as number) || 0;
        const open = expanded[review.id] ?? false;

        return (
          <Card key={review.id} className="overflow-hidden">
            {/* Card header row */}
            <CardHeader className="flex flex-row items-start justify-between gap-4 border-b p-4">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">PR #{review.prNumber}</Badge>
                  <Badge
                    variant={review.status === "completed" ? "default" : "secondary"}
                  >
                    {review.status}
                  </Badge>
                  {score > 0 ? <ScoreBadge score={score} /> : null}
                </div>
                <h3 className="truncate text-base font-medium">
                  {review.prTitle ? (
                    <a
                      href={safeUrl(review.prUrl)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="hover:underline"
                    >
                      {review.prTitle}
                    </a>
                  ) : (
                    `PR #${review.prNumber}`
                  )}
                </h3>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}</span>
                  {review.sha ? (
                    <span className="font-mono">{review.sha.slice(0, 7)}</span>
                  ) : null}
                  {review.prUrl ? (
                    <a
                      href={safeUrl(review.prUrl)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="hover:underline"
                    >
                      View on GitHub →
                    </a>
                  ) : null}
                </p>
              </div>

              <button
                onClick={() =>
                  setExpanded((s) => ({ ...s, [review.id]: !s[review.id] }))
                }
                aria-label={open ? "Collapse review" : "Expand review"}
                className="rounded-md border p-2 text-muted-foreground hover:bg-muted"
              >
                {open ? "▲" : "▼"}
              </button>
            </CardHeader>

            {open ? (
              <CardContent className="space-y-5 p-4">
                {/* Summary */}
                {review.summary ? (
                  <div>
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                      Summary
                    </h4>
                    <p className="mt-1 text-sm">{review.summary}</p>
                  </div>
                ) : null}

                {/* Issues */}
                {issues.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                      Issues ({issues.length})
                    </h4>
                    <div className="grid gap-3">
                      {issues.map((issue, idx) => (
                        <div
                          key={idx}
                          className="rounded-md border bg-muted/40 p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <SeverityBadge severity={issue.severity} />
                            <span className="text-sm font-medium">{issue.title}</span>
                            {issue.file ? (
                              <code className="text-[11px] text-muted-foreground">
                                {issue.file}:{issue.line ?? ""}
                              </code>
                            ) : null}
                          </div>
                          {issue.description ? (
                            <p className="mt-1.5 text-xs text-muted-foreground">
                              {issue.description}
                            </p>
                          ) : null}
                          {issue.suggestion ? (
                            <div className="mt-2">
                              <p className="text-[10px] font-medium uppercase text-muted-foreground">
                                Suggested fix
                              </p>
                              <pre className="mt-1 overflow-x-auto rounded-md border bg-background p-2 text-[11px] leading-relaxed font-mono">
                                {issue.suggestion}
                              </pre>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggestions with diff */}
                {suggestions.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                      Suggestions ({suggestions.length})
                    </h4>
                    <div className="grid gap-3">
                      {suggestions.map((s, idx) => (
                        <div
                          key={idx}
                          className="rounded-md border bg-muted/40 p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Info className="h-3.5 w-3.5 text-yellow-500" />
                            <span className="text-sm font-medium">{s.title}</span>
                            {s.file ? (
                              <code className="text-[11px] text-muted-foreground">
                                {s.file}
                              </code>
                            ) : null}
                          </div>
                          {s.description ? (
                            <p className="mt-1.5 text-xs text-muted-foreground">
                              {s.description}
                            </p>
                          ) : null}
                          {s.codeAfter ? (
                            <div className="mt-2">
                              <p className="text-[10px] font-medium uppercase text-muted-foreground">
                                Proposed change
                              </p>
                              <pre className="mt-1 overflow-x-auto rounded-md border bg-background p-2 text-[11px] leading-relaxed font-mono">
                                {s.codeAfter}
                              </pre>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Positives */}
                {positives.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                      Positives
                    </h4>
                    <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
                      {positives.map((p, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <ThumbsUp className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {review.status !== "completed" && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-400">
                    {review.status === "failed"
                      ? "Review failed - check the error comment on the PR."
                      : "Review is still in progress."}
                  </div>
                )}
              </CardContent>
            ) : (
              <CardContent className="p-3">
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {review.summary || "No summary available."}
                </p>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
