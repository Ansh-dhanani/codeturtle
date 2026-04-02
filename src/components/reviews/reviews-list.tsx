"use client";

import { useQuery } from "@tanstack/react-query";
import { getReviews } from "@/module/review/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle2, Info, Lightbulb, ThumbsUp, FileCode } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case "critical":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case "warning":
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    case "info":
      return <Info className="h-4 w-4 text-blue-500" />;
    default:
      return <Info className="h-4 w-4 text-gray-500" />;
  }
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? "bg-green-500/10 text-green-600 border-green-500/20" : score >= 5 ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" : "bg-red-500/10 text-red-600 border-red-500/20";
  return <Badge className={`border ${color}`}>{score}/10</Badge>;
}

export default function ReviewsList() {
  const { data: reviews, isLoading, error } = useQuery({
    queryKey: ["reviews"],
    queryFn: async () => await getReviews(),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
        <CardContent className="pt-6">
          <p className="text-red-600 dark:text-red-400">Failed to load reviews. Please try again.</p>
        </CardContent>
      </Card>
    );
  }

  if (!reviews || reviews.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <FileCode className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">No reviews yet</h3>
          <p className="mt-2 text-muted-foreground">
            Connect a repository and trigger a review on a PR to get started.
          </p>
          <Link href="/repositories" className="mt-4 inline-block text-primary hover:underline">
            Browse repositories
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {reviews.map((review) => {
        const files = review.files as Record<string, unknown> | null;
        const issues = (files?.issues as unknown[]) || [];
        const suggestions = (files?.suggestions as unknown[]) || [];
        const positives = (files?.positives as string[]) || [];
        const score = (files?.overallScore as number) || 0;

        return (
          <Card key={review.id} className="transition-shadow hover:shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">
                    <Link href={`/repositories`} className="hover:underline">
                      {review.owner}/{review.repo}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {review.prNumber ? `PR #${review.prNumber}` : "File review"}
                    {" · "}
                    {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                  </CardDescription>
                </div>
                <ScoreBadge score={score} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {review.summary && (
                <p className="text-sm text-muted-foreground">{review.summary}</p>
              )}

              {issues.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    Issues ({issues.length})
                  </h4>
                  <div className="space-y-2">
                    {(issues as Array<{ severity: string; title: string; description: string; file: string; suggestion?: string }>).map((issue, idx) => (
                      <div key={idx} className="rounded-lg border bg-muted/50 p-3">
                        <div className="flex items-center gap-2">
                          <SeverityIcon severity={issue.severity} />
                          <span className="text-sm font-medium">{issue.title}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{issue.description}</p>
                        <p className="mt-1 text-xs font-mono text-muted-foreground/70">{issue.file}</p>
                        {issue.suggestion && (
                          <p className="mt-2 text-xs text-green-600 dark:text-green-400">
                            Fix: {issue.suggestion}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-yellow-500" />
                    Suggestions ({suggestions.length})
                  </h4>
                  <div className="space-y-2">
                    {(suggestions as Array<{ title: string; description: string; file: string }>).map((s, idx) => (
                      <div key={idx} className="rounded-lg border bg-muted/50 p-3">
                        <span className="text-sm font-medium">{s.title}</span>
                        <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
                        <p className="mt-1 text-xs font-mono text-muted-foreground/70">{s.file}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {positives.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <ThumbsUp className="h-4 w-4 text-green-500" />
                    Positives
                  </h4>
                  <ul className="list-disc list-inside space-y-1">
                    {positives.map((p, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground">{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t">
                <Badge variant={review.status === "completed" ? "default" : "secondary"}>
                  {review.status === "completed" ? (
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Completed</span>
                  ) : (
                    <span className="flex items-center gap-1"><Info className="h-3 w-3" /> {review.status}</span>
                  )}
                </Badge>
                {review.status === "completed" && review.prNumber && (
                  <button
                    onClick={async () => {
                      try {
                        const { generateFixPR } = await import("@/module/review/actions");
                        const result = await generateFixPR(review.id);
                        toast.success(`Fix PR created: #${result.prNumber}`);
                      } catch (error) {
                        toast.error((error as Error).message || "Failed to generate fix PR");
                      }
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Generate Fix PR
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
