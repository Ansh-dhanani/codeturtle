"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getAnalyticsReport } from "@/module/report/actions";
import { buildReportMarkdown } from "@/lib/report-markdown";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EvilAreaChart } from "@/components/evilcharts/charts/recharts-area-chart";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
} from "recharts";
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Download,
  BarChart3,
  GitPullRequest,
  Target,
  Flame,
  ListChecks,
  Zap,
  ArrowRight,
  ThumbsUp,
} from "lucide-react";

const SEVERITY_COLORS = { critical: "#f43f5e", warning: "#f59e0b", info: "#38bdf8" } as const;

export default function AnalyticsPage() {
  const [scope, setScope] = useState<string>("all");
  const { data: report, isLoading } = useQuery({
    queryKey: ["analytics-report", scope],
    queryFn: () => getAnalyticsReport(scope === "all" ? {} : { repositoryId: scope }),
    refetchOnWindowFocus: false,
  });

  const scopeLabel = scope === "all"
    ? "All repositories"
    : report?.repos.find((r) => r.id === scope)?.name ?? "Repository";

  const handleDownload = () => {
    if (!report) return;
    trackEvent(AnalyticsEvents.reportDownloaded, { scope });
    const md = buildReportMarkdown(report, scopeLabel);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `codeturtle-report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const insights = useMemo(() => {
    if (!report) return null;
    const t = report.totals;
    const latestWeekScore = report.scoreTrend[report.scoreTrend.length - 1]?.avg ?? null;
    const earlierWeekScore = report.scoreTrend[Math.max(0, report.scoreTrend.length - 5)]?.avg ?? null;
    const trendDelta = latestWeekScore !== null && earlierWeekScore !== null ? Math.round((latestWeekScore - earlierWeekScore) * 10) / 10 : null;
    const busiestRepo = report.perRepo[0]?.name ?? null;
    const reposWithIssues = report.perRepo.filter((r) => r.issues > 0).length;
    const totalWarnings = report.severity.find((s) => s.name === "warning")?.value ?? 0;
    return { latestWeekScore, trendDelta, busiestRepo, reposWithIssues, totalWarnings, t };
  }, [report]);

  if (isLoading || !report || !insights) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const t = report.totals;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold leading-none tracking-tight">Analytics</h1>
            <p className="mt-1 text-xs text-muted-foreground">CodeTurtle review performance - last 6 months - {scopeLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="h-9 w-52" aria-label="Scope">
              <SelectValue placeholder="All repositories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All repositories</SelectItem>
              {report.repos.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={handleDownload}
            className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Download className="h-4 w-4" />
            Report
          </button>
        </div>
      </div>

      {/* ── Insight callouts ── */}
      <div className="grid gap-3 md:grid-cols-3">
        <InsightCard
          icon={<Zap className="h-4 w-4" />}
          label="Avg score trend"
          value={insights.trendDelta !== null ? `${insights.trendDelta >= 0 ? "+" : ""}${insights.trendDelta}` : "-"}
          hint={insights.trendDelta !== null ? (insights.trendDelta >= 0 ? "Trending up over last 4-5 weeks" : "Trending down - review settings") : "Not enough data"}
          tone={insights.trendDelta !== null && insights.trendDelta < 0 ? "warn" : "good"}
        />
        <InsightCard
          icon={<Target className="h-4 w-4" />}
          label="Active repo"
          value={insights.busiestRepo ? insights.busiestRepo.split("/")[1] : "-"}
          hint={insights.busiestRepo ? insights.busiestRepo : "No reviews yet"}
          tone="neutral"
        />
        <InsightCard
          icon={<Flame className="h-4 w-4" />}
          label="Warnings outstanding"
          value={`${insights.totalWarnings}`}
          hint={insights.reposWithIssues > 0 ? `${insights.reposWithIssues} repo(s) have unresolved issues` : "Clean across all repositories"}
          tone={insights.totalWarnings > 0 ? "warn" : "good"}
        />
      </div>

      {/* ── KPIs ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Reviews" value={`${t.reviews}`} icon={GitPullRequest} />
        <KpiCard label="Completion" value={`${t.completionRate}%`} icon={CheckCircle2} />
        <KpiCard label="Avg score" value={t.avgScore !== null ? `${t.avgScore}/10` : "-"} icon={TrendingUp} />
        <KpiCard label="Issues found" value={`${t.totalIssues}`} icon={AlertTriangle} />
      </div>

      {/* ── Findings feedback ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <ThumbsUp className="h-4 w-4 text-primary" /> Findings feedback · last 6 months
          </CardTitle>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">from review feedback buttons</Badge>
        </CardHeader>
        <CardContent>
          {report?.feedback && (report.feedback.helpful + report.feedback.notHelpful) > 0 ? (
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="text-2xl font-semibold tabular-nums">{report.feedback.helpful}</p>
                <p className="text-xs text-muted-foreground">marked helpful</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-rose-600 dark:text-rose-400">{report.feedback.notHelpful}</p>
                <p className="text-xs text-muted-foreground">marked not helpful</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{report.feedback.helpfulRate}%</p>
                <p className="text-xs text-muted-foreground">helpful rate</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No feedback yet — use the thumbs on the Reviews page to teach the bot which findings are useful.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Score trend ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Avg review score · 12 weeks
          </CardTitle>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">weekly rollup</Badge>
        </CardHeader>
        <CardContent className="pt-0">
          {report.scoreTrend.every((w) => (w.count ?? 0) === 0) ? (
            <EmptyState message="No reviews completed in the last 12 weeks yet." />
          ) : (
            <EvilAreaChart
              config={{ avg: { label: "Avg score", colors: { dark: ["#818cf8"], light: ["#6366f1"] } } }}
              data={report.scoreTrend.map((w) => ({ label: w.label, avg: w.avg, counts: w.count }))}
              className="h-64"
              xDataKey="label"
              curveType="monotone"
            >
              <EvilAreaChart.XAxis dataKey="label" tickMargin={10} />
              <EvilAreaChart.YAxis domain={[0, 10]} />
              <EvilAreaChart.Grid />
              <EvilAreaChart.Tooltip />
              <EvilAreaChart.Area dataKey="avg" isClickable={false} />
            </EvilAreaChart>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* ── Severity breakdown ── */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" /> Severity mix
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.severity.length === 0 ? (
              <EmptyState message="No issues recorded yet." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={report.severity}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {report.severity.map((s) => (
                      <Cell key={s.name} fill={SEVERITY_COLORS[s.name as keyof typeof SEVERITY_COLORS]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
            <ul className="mt-3 space-y-1.5 text-xs">
              {report.severity.map((s) => {
                const total = report.severity.reduce((a, b) => a + b.value, 0);
                const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
                return (
                  <li key={s.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 capitalize text-muted-foreground">
                      <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLORS[s.name as keyof typeof SEVERITY_COLORS] }} />
                      {s.name}
                    </span>
                    <span className="tabular-nums text-foreground">{s.value} <span className="text-muted-foreground">({pct}%)</span></span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {/* ── Issues per week ── */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" /> Issues by week
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.issueVolume.every((w) => w.critical + w.warning + w.info === 0) ? (
              <EmptyState message="No issues recorded yet." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={report.issueVolume} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <RechartsTooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }} cursor={{ fill: "rgba(148,163,184,0.12)" }} />
                  <Bar dataKey="critical" stackId="a" fill={SEVERITY_COLORS.critical} name="Critical" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="warning" stackId="a" fill={SEVERITY_COLORS.warning} name="Warning" />
                  <Bar dataKey="info" stackId="a" fill={SEVERITY_COLORS.info} name="Info" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Per repo ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Where the issues live</CardTitle>
          <Link href="/repositories" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            All repositories <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4">Repository</th>
                  <th className="py-2 pr-4">Reviews</th>
                  <th className="py-2 pr-4">Avg</th>
                  <th className="py-2 pr-4">Issues</th>
                  <th className="py-2 pr-4">Completion</th>
                </tr>
              </thead>
              <tbody>
                {report.perRepo.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-xs text-muted-foreground">No repositories connected yet.</td></tr>
                )}
                {report.perRepo.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 last:border-0">
                    <td className="py-2.5 pr-4 font-mono text-xs">{r.name}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{r.reviews}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`inline-flex h-6 min-w-8 items-center justify-center rounded-md px-1.5 text-xs font-semibold ${r.avgScore !== null && r.avgScore >= 7 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : r.avgScore !== null && r.avgScore >= 5 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"}`}>
                        {r.avgScore !== null ? r.avgScore : "-"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums">{r.issues}</td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-primary/70" style={{ width: `${r.completionRate}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">{r.completionRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1.5 text-lg font-semibold tabular-nums leading-none">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function InsightCard({
  icon,
  label,
  value,
  hint: _hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "good" | "warn" | "neutral";
}) {
  const toneClasses = {
    good: "bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    warn: "bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400",
    neutral: "bg-muted/30 border-border text-foreground",
  }[tone];
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${toneClasses}`}>
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background/50">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider opacity-80">{label}</p>
        <p className="mt-1 text-base font-semibold tabular-nums leading-none">{value}</p>
        <p className="mt-1 truncate text-[11px] opacity-70">{_hint}</p>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="flex h-56 items-center justify-center text-sm text-muted-foreground">{message}</p>;
}
