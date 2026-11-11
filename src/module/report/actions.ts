"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export type AnalyticsSeverity = "critical" | "warning" | "info";

export type AnalyticsReport = {
  repos: Array<{ id: string; name: string; url: string }>;
  totals: {
    reviews: number;
    avgScore: number | null;
    totalIssues: number;
    totalSuggestions: number;
    totalPositives: number;
    completionRate: number;
  };
  scoreTrend: Array<{ label: string; avg: number; count: number }>;
  issueVolume: Array<{ label: string; critical: number; warning: number; info: number }>;
  severity: Array<{ name: AnalyticsSeverity; value: number }>;
  perRepo: Array<{
    id: string;
    name: string;
    reviews: number;
    avgScore: number | null;
    issues: number;
    suggestions: number;
    completionRate: number;
  }>;
  recentReviews: Array<{
    id: string;
    repo: string;
    prNumber: number;
    prTitle: string | null;
    prUrl: string | null;
    score: number | null;
    issues: number;
    suggestions: number;
    status: string;
    createdAt: string;
  }>;
};

type ReviewRow = {
  id: string;
  repositoryId: string;
  prNumber: number;
  prTitle: string | null;
  prUrl: string | null;
  status: string;
  createdAt: Date;
  files: unknown;
  repository: { fullName: string };
};

type ReviewFiles = {
  issues?: Array<{ severity?: string }>;
  suggestions?: Array<unknown>;
  positives?: Array<unknown>;
  overallScore?: number;
};

const asFiles = (files: unknown): ReviewFiles =>
  (files && typeof files === "object" ? files : {}) as ReviewFiles;

const severityOf = (issue: { severity?: string }): AnalyticsSeverity => {
  const s = (issue.severity || "").toLowerCase();
  if (s === "critical" || s === "high" || s === "error") return "critical";
  if (s === "info" || s === "note" || s === "low") return "info";
  return "warning";
};

/** Start (Monday 00:00) of the ISO week containing `date`. */
function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - dow + 1);
  return d;
}

const weekLabel = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export async function getAnalyticsReport(options: { repositoryId?: string } = {}): Promise<AnalyticsReport> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const sixMonthsAgo = new Date(Date.now() - 182 * 24 * 60 * 60 * 1000);

  const repos = await prisma.repository.findMany({
    where: { userId: session.user.id },
    select: { id: true, fullName: true, url: true },
    orderBy: { fullName: "asc" },
  });

  const reviews = (await prisma.codeReview.findMany({
    where: {
      userId: session.user.id,
      createdAt: { gte: sixMonthsAgo },
      ...(options.repositoryId ? { repositoryId: options.repositoryId } : {}),
    },
    include: { repository: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" },
  })) as ReviewRow[];

  // --- Overall KPIs ---
  let totalIssues = 0;
  let totalSuggestions = 0;
  let totalPositives = 0;
  const scoreValues: number[] = [];
  let completed = 0;

  // --- Weekly buckets (last 12 weeks) ---
  const now = new Date();
  const twelveWeeksAgo = startOfWeek(new Date(now.getTime() - 11 * 7 * 24 * 60 * 60 * 1000));
  const weekBuckets = new Map<string, { label: string; sum: number; count: number; critical: number; warning: number; info: number }>();
  for (let i = 0; i < 12; i++) {
    const wk = new Date(twelveWeeksAgo.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    weekBuckets.set(wk.toISOString().slice(0, 10), { label: weekLabel(wk), sum: 0, count: 0, critical: 0, warning: 0, info: 0 });
  }

  // --- Severity totals ---
  const severityTotals: Record<AnalyticsSeverity, number> = { critical: 0, warning: 0, info: 0 };

  // --- Per-repo aggregation ---
  const perRepoMap = new Map<string, { reviews: number; completed: number; issues: number; suggestions: number; scoreSum: number; scoreCount: number }>();
  for (const r of repos) {
    perRepoMap.set(r.id, { reviews: 0, completed: 0, issues: 0, suggestions: 0, scoreSum: 0, scoreCount: 0 });
  }

  for (const review of reviews) {
    const files = asFiles(review.files);
    const issues = Array.isArray(files.issues) ? files.issues : [];
    const suggestions = Array.isArray(files.suggestions) ? files.suggestions : [];
    const positives = Array.isArray(files.positives) ? files.positives : [];
    const isCompleted = review.status === "completed";

    totalIssues += issues.length;
    totalSuggestions += suggestions.length;
    totalPositives += positives.length;
    if (isCompleted) completed++;

    const score = typeof files.overallScore === "number" ? files.overallScore : null;
    if (score !== null && isCompleted) scoreValues.push(score);

    for (const issue of issues) severityTotals[severityOf(issue)]++;

    // Weekly bucket
    const wkKey = startOfWeek(review.createdAt).toISOString().slice(0, 10);
    const bucket = weekBuckets.get(wkKey);
    if (bucket) {
      if (score !== null) { bucket.sum += score; bucket.count++; }
      for (const issue of issues) {
        const sev = severityOf(issue);
        if (sev === "critical") bucket.critical++;
        else if (sev === "info") bucket.info++;
        else bucket.warning++;
      }
    }

    // Per repo
    const agg = perRepoMap.get(review.repositoryId);
    if (agg) {
      agg.reviews++;
      if (isCompleted) agg.completed++;
      agg.issues += issues.length;
      agg.suggestions += suggestions.length;
      if (score !== null && isCompleted) { agg.scoreSum += score; agg.scoreCount++; }
    }
  }

  const avgScore = scoreValues.length
    ? Math.round((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) * 10) / 10
    : null;

  const completionRate = reviews.length ? Math.round((completed / reviews.length) * 100) : 0;

  const scoreTrend = [...weekBuckets.values()].map((b) => ({
    label: b.label,
    avg: b.count ? Math.round((b.sum / b.count) * 10) / 10 : 0,
    count: b.count,
  }));

  const issueVolume = [...weekBuckets.values()].map((b) => ({
    label: b.label,
    critical: b.critical,
    warning: b.warning,
    info: b.info,
  }));

  const severity = ([
    { name: "critical", value: severityTotals.critical },
    { name: "warning", value: severityTotals.warning },
    { name: "info", value: severityTotals.info },
  ] satisfies Array<{ name: AnalyticsSeverity; value: number }>).filter((s) => s.value > 0);

  const perRepo = repos
    .filter((r) => !options.repositoryId || r.id === options.repositoryId)
    .map((r) => {
      const agg = perRepoMap.get(r.id)!;
      return {
        id: r.id,
        name: r.fullName,
        reviews: agg.reviews,
        avgScore: agg.scoreCount ? Math.round((agg.scoreSum / agg.scoreCount) * 10) / 10 : null,
        issues: agg.issues,
        suggestions: agg.suggestions,
        completionRate: agg.reviews ? Math.round((agg.completed / agg.reviews) * 100) : 0,
      };
    })
    .sort((a, b) => b.reviews - a.reviews);

  const recentReviews = [...reviews].slice(-25).reverse().map((review) => {
    const files = asFiles(review.files);
    const issues = Array.isArray(files.issues) ? files.issues : [];
    const suggestions = Array.isArray(files.suggestions) ? files.suggestions : [];
    return {
      id: review.id,
      repo: review.repository.fullName,
      prNumber: review.prNumber,
      prTitle: review.prTitle,
      prUrl: review.prUrl,
      score: typeof files.overallScore === "number" ? files.overallScore : null,
      issues: issues.length,
      suggestions: suggestions.length,
      status: review.status,
      createdAt: review.createdAt.toISOString(),
    };
  });

  return {
    repos: repos.map((r) => ({ id: r.id, name: r.fullName, url: r.url })),
    totals: {
      reviews: reviews.length,
      avgScore,
      totalIssues,
      totalSuggestions,
      totalPositives,
      completionRate,
    },
    scoreTrend,
    issueVolume,
    severity,
    perRepo,
    recentReviews,
  };
}
