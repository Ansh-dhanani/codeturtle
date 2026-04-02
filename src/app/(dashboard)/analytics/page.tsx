"use client";

import { useQuery } from "@tanstack/react-query";
import { getDashboardStats, getMonthlyActivity } from "@/module/dashboard/actions";
import { getReviews } from "@/module/review/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";

const COLORS = ["#22c55e", "#eab308", "#ef4444", "#3b82f6"];

export default function AnalyticsPage() {
  const { data: monthly, isLoading: monthlyLoading } = useQuery({
    queryKey: ["monthly-activity"],
    queryFn: async () => await getMonthlyActivity(),
    refetchOnWindowFocus: false,
  });

  const { data: reviews, isLoading: reviewsLoading } = useQuery({
    queryKey: ["reviews-analytics"],
    queryFn: async () => await getReviews({ limit: 50 }),
    refetchOnWindowFocus: false,
  });

  const reviewStats = reviews ? computeReviewStats(reviews) : null;

  if (monthlyLoading || reviewsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardHeader><Skeleton className="h-4 w-32" /></CardHeader><CardContent><Skeleton className="h-8 w-20" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">Insights into your code review quality and patterns</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Avg Review Score" value={reviewStats?.avgScore?.toFixed(1) || "—"} icon={TrendingUp} />
        <StatCard label="Total Issues Found" value={reviewStats?.totalIssues || "—"} icon={AlertTriangle} />
        <StatCard label="Completion Rate" value={reviewStats?.completionRate ? `${reviewStats.completionRate}%` : "—"} icon={CheckCircle} />
      </div>

      {reviewStats?.severityBreakdown && reviewStats.severityBreakdown.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Issue Severity Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={reviewStats.severityBreakdown} cx="50%" cy="50%" outerRadius={80} label dataKey="count" nameKey="name">
                    {reviewStats.severityBreakdown.map((_: unknown, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Monthly Activity</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="commits" fill="#3b82f6" name="Commits" />
                <Bar dataKey="prs" fill="#22c55e" name="PRs" />
                <Bar dataKey="reviews" fill="#eab308" name="AI Reviews" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
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

function computeReviewStats(reviews: Array<{ status: string; files: unknown }>) {
  const completed = reviews.filter((r) => r.status === "completed");
  const totalIssues = completed.reduce((sum, r) => {
    const files = r.files as Record<string, unknown> | null;
    const issues = (files?.issues as unknown[]) || [];
    return sum + issues.length;
  }, 0);

  const scores = completed.map((r) => {
    const files = r.files as Record<string, unknown> | null;
    return (files?.overallScore as number) || 0;
  }).filter((s) => s > 0);

  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const severityCount: Record<string, number> = { critical: 0, warning: 0, info: 0 };
  completed.forEach((r) => {
    const files = r.files as Record<string, unknown> | null;
    const issues = (files?.issues as Array<{ severity: string }>) || [];
    issues.forEach((issue) => {
      if (severityCount[issue.severity] !== undefined) {
        severityCount[issue.severity]++;
      }
    });
  });

  const severityBreakdown = Object.entries(severityCount)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => ({ name, count }));

  const completionRate = reviews.length > 0 ? Math.round((completed.length / reviews.length) * 100) : 0;

  return { avgScore, totalIssues, severityBreakdown, completionRate };
}
