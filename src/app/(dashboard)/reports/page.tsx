"use client";

import { useQuery } from "@tanstack/react-query";
import { getReviews, getUserSubscription } from "@/module/review/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { Download, FileText, TrendingUp, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { formatDistanceToNow, subDays, eachDayOfInterval } from "date-fns";

export default function ReportsPage() {
  const { data: reviews, isLoading: reviewsLoading } = useQuery({
    queryKey: ["reports-reviews"],
    queryFn: async () => await getReviews({ limit: 100 }),
    refetchOnWindowFocus: false,
  });

  const { data: subscription } = useQuery({
    queryKey: ["reports-subscription"],
    queryFn: async () => await getUserSubscription(),
    refetchOnWindowFocus: false,
  });

  const reportData = reviews ? generateReportData(reviews) : null;

  if (reviewsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardHeader><Skeleton className="h-4 w-24" /></CardHeader><CardContent><Skeleton className="h-8 w-16" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">Detailed analysis of your code review history</p>
        </div>
        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total Reviews" value={reportData?.totalReviews || 0} icon={FileText} />
        <StatCard label="Avg Score" value={reportData?.avgScore?.toFixed(1) || "0"} icon={TrendingUp} />
        <StatCard label="Issues Found" value={reportData?.totalIssues || 0} icon={AlertTriangle} />
        <StatCard label="Completion Rate" value={`${reportData?.completionRate || 0}%`} icon={CheckCircle} />
      </div>

      {reportData?.scoreTrend && reportData.scoreTrend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Review Score Trend</CardTitle>
            <CardDescription>Average review scores over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reportData.scoreTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={[0, 10]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {reportData?.severityBreakdown && reportData.severityBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Issue Severity Distribution</CardTitle>
            <CardDescription>Breakdown of issues by severity across all reviews</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportData.severityBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#ef4444" name="Critical" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {subscription && (
        <Card>
          <CardHeader>
            <CardTitle>Usage Summary</CardTitle>
            <CardDescription>Your current plan usage this billing period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Reviews used</span>
                </div>
                <span className="text-sm font-medium">
                  {subscription.usage.used} / {subscription.usage.limit === -1 ? "Unlimited" : subscription.usage.limit}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{
                    width: subscription.usage.limit === -1
                      ? "100%"
                      : `${Math.min(100, (subscription.usage.used / subscription.usage.limit) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Plan: <Badge variant="secondary" className="capitalize">{subscription.plan}</Badge>
                {subscription.currentPeriodEnd && (
                  <> · Resets {formatDistanceToNow(new Date(subscription.currentPeriodEnd), { addSuffix: true })}</>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function generateReportData(reviews: Array<{ createdAt: Date | string; status: string; files: unknown }>) {
  const completed = reviews.filter((r) => r.status === "completed");
  const totalReviews = reviews.length;
  const completionRate = totalReviews > 0 ? Math.round((completed.length / totalReviews) * 100) : 0;

  const scores = completed.map((r) => {
    const files = r.files as Record<string, unknown> | null;
    return (files?.overallScore as number) || 0;
  }).filter((s) => s > 0);

  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const totalIssues = completed.reduce((sum, r) => {
    const files = r.files as Record<string, unknown> | null;
    const issues = (files?.issues as unknown[]) || [];
    return sum + issues.length;
  }, 0);

  const severityCount: Record<string, number> = { critical: 0, warning: 0, info: 0 };
  completed.forEach((r) => {
    const files = r.files as Record<string, unknown> | null;
    const issues = (files?.issues as Array<{ severity: string }>) || [];
    issues.forEach((issue) => {
      if (severityCount[issue.severity] !== undefined) severityCount[issue.severity]++;
    });
  });

  const severityBreakdown = Object.entries(severityCount)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), count }));

  const now = new Date();
  const days = eachDayOfInterval({ start: subDays(now, 29), end: now });
  const scoreTrend = days.map((day) => {
    const dayStr = day.toISOString().split("T")[0];
    const dayReviews = completed.filter((r) => {
      const date = new Date(r.createdAt);
      return date.toISOString().split("T")[0] === dayStr;
    });
    const dayScores = dayReviews.map((r) => {
      const files = r.files as Record<string, unknown> | null;
      return (files?.overallScore as number) || 0;
    }).filter((s) => s > 0);
    return {
      date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      score: dayScores.length > 0 ? dayScores.reduce((a, b) => a + b, 0) / dayScores.length : null,
    };
  }).filter((d) => d.score !== null);

  return { totalReviews, avgScore, totalIssues, completionRate, severityBreakdown, scoreTrend };
}
