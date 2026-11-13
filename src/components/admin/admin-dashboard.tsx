"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  GitBranch,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Search,
  TrendingUp,
  Flame,
  ShieldCheck,
  Crown,
  Gauge,
  UserPlus,
  ExternalLink,
  ChevronDown,
  Sparkles,
  Ban,
  Loader2,
} from "lucide-react";
import type { AdminOverview } from "@/module/admin/actions";

type SortKey = "lastActivity" | "reviews" | "avgScore" | "usage" | "joined";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "lastActivity", label: "Last activity" },
  { value: "reviews", label: "Reviews" },
  { value: "avgScore", label: "Avg score" },
  { value: "usage", label: "Monthly usage" },
  { value: "joined", label: "Joined" },
];

const PLAN_BADGE: Record<string, string> = {
  free: "bg-secondary text-secondary-foreground",
  pro: "bg-primary/15 text-primary border border-primary/30",
  enterprise: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30",
};

function initials(name: string, email: string) {
  const source = name.trim() || email.split("@")[0] || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

type PendingAction = { userId: string; action: "grant" | "revoke" } | null;

const numberFmt = new Intl.NumberFormat();

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function AdminDashboard({ data }: { data: AdminOverview }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("lastActivity");
  const [showUsers, setShowUsers] = useState(25);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isPending, startTransition] = useTransition();

  const runCompAction = (userId: string, action: "grant" | "revoke") => {
    const verb = action === "grant" ? "grant 1-month Pro to" : "revoke comp Pro from";
    const ok = window.confirm(`Are you sure you want to ${verb} this user?`);
    if (!ok) return;

    setPendingAction({ userId, action });
    startTransition(async () => {
      try {
        const { grantCompPro, revokeCompPro } = await import("@/module/admin/actions");
        const result = action === "grant" ? await grantCompPro({ userId }) : await revokeCompPro({ userId });
        if (!result.ok) {
          toast.error(result.error);
        } else {
          toast.success(action === "grant" ? "Pro granted for 1 month" : "Comp Pro revoked");
          window.location.reload();
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      } finally {
        setPendingAction(null);
      }
    });
  };

  const filteredUsers = useMemo(() => {
    const allUsers = Array.isArray(data?.users) ? data.users : [];
    const q = query.trim().toLowerCase();
    const base = q
      ? allUsers.filter((user) =>
          [user.name, user.email].join(" ").toLowerCase().includes(q),
        )
      : [...allUsers];

    base.sort((a, b) => {
      switch (sort) {
        case "reviews":
          return b.reviewCount - a.reviewCount;
        case "avgScore":
          return (b.avgScore ?? -1) - (a.avgScore ?? -1);
        case "usage":
          return b.monthlyUsage - a.monthlyUsage;
        case "joined":
          return Date.parse(b.createdAt) - Date.parse(a.createdAt);
        case "lastActivity":
        default:
          return (b.lastReviewAt ? Date.parse(b.lastReviewAt) : 0) - (a.lastReviewAt ? Date.parse(a.lastReviewAt) : 0);
      }
    });
    return base;
  }, [data.users, query, sort]);

  const shownUsers = filteredUsers.slice(0, showUsers);
  const totals = data.totals;
  const planTotal = data.plans.reduce((sum, row) => sum + row.count, 0);

  const kpis = [
    { icon: Users, label: "Total users", value: numberFmt.format(totals.users), hint: `${totals.newUsers7d} new · 7d  ·  ${totals.newUsers30d} new · 30d` },
    { icon: UserPlus, label: "New users (7d)", value: numberFmt.format(totals.newUsers7d), hint: `${numberFmt.format(totals.newUsers30d)} in last 30d` },
    { icon: GitBranch, label: "Repositories", value: numberFmt.format(totals.repositories), hint: "connected repos" },
    { icon: ClipboardCheck, label: "Reviews posted", value: numberFmt.format(totals.reviews), hint: `${totals.reviews7d} in 7d  ·  ${totals.reviewsToday} today` },
    { icon: CheckCircle2, label: "Completion rate", value: `${totals.completionRate}%`, hint: `${totals.completedReviews} completed · ${totals.failedReviews} failed` },
    { icon: Gauge, label: "Monthly usage", value: numberFmt.format(totals.monthlyUsageTotal), hint: "reviews counted this month" },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
            <Badge variant="outline" className="gap-1 border-primary/40 text-primary text-[10px]">
              <ShieldCheck className="h-3 w-3" /> admin-only
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything across every user — signups, plans, usage, reviews, failures. Access comes from <code className="rounded bg-muted px-1.5 py-0.5 text-xs">ADMIN_USERS</code> in the environment.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border bg-card px-2 py-1"><ShieldCheck className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />{totals.adminUsers} admin{totals.adminUsers === 1 ? "" : "s"}</span>
          <span className="rounded-md border bg-card px-2 py-1"><Crown className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />{totals.specialLimitlessUsers} special-limitless</span>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="rounded-xl">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Icon className="h-3.5 w-3.5 text-primary" /> {kpi.label}
                </div>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums leading-none">{kpi.value}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{kpi.hint}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Plans + special list ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Plan distribution</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.plans.length === 0 ? (
              <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
            ) : (
              data.plans.map((row) => (
                <div key={`${row.plan}-${row.status}`} className="flex items-center justify-between gap-2 text-sm">
                  <Badge className={PLAN_BADGE[row.plan] ?? ""}>{row.plan} · {row.status}</Badge>
                  <span className="tabular-nums text-muted-foreground">{row.count} ({planTotal ? Math.round((row.count / planTotal) * 100) : 0}%)</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" /> Special-limitless identifiers (env)</CardTitle></CardHeader>
          <CardContent>
            {data.specialLimitlessIdentifiers.length === 0 ? (
              <p className="text-sm text-muted-foreground">SPECIAL_LIMITLESS_USERS is unset — nobody has unlimited access.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.specialLimitlessIdentifiers.map((id) => (
                  <code key={id} className="rounded-md border bg-muted px-2 py-1 text-xs text-foreground">{id}</code>
                ))}
              </div>
            )}
            <p className="mt-3 text-[10px] text-muted-foreground">Special-limitless users have unlimited reviews/repos and still don&apos;t count toward billing limits. Admin rights are separate — this list never grants /admin access.</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Users table ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm">All users ({filteredUsers.length}{query ? ` of ${data.users.length}` : ""})</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name or email…"
                  className="h-8 w-52 pl-8"
                />
              </div>
              <div className="relative">
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                  className="h-8 appearance-none rounded-md border border-border bg-background pl-2 pr-8 text-xs outline-none"
                >
                  {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">User</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Repos</th>
                <th className="px-3 py-2">Reviews</th>
                <th className="px-3 py-2">Avg</th>
                <th className="px-3 py-2">Usage</th>
                <th className="px-3 py-2">Last review</th>
                <th className="px-4 py-2">Joined</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shownUsers.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">No users match “{query}”.</td></tr>
              ) : shownUsers.map((user) => (
                <tr key={user.id} className="border-t border-border/60 hover:bg-muted/20">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2.5">
                      {user.image ? (
                        <Image
                          src={user.image}
                          alt={user.name || user.email}
                          width={32}
                          height={32}
                          unoptimized
                          className="h-8 w-8 shrink-0 rounded-full border border-border object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                          {initials(user.name, user.email)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{user.name || "(no name)"}</div>
                        <div className="text-[10px] text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <Badge className={`${PLAN_BADGE[user.plan] ?? ""} w-fit text-[10px]`}>{user.plan}</Badge>
                      {user.plan === "pro" && user.compProUntil && !user.hasPolarSubscription && (
                        <span className="w-fit rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                          comp until {new Date(user.compProUntil).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{user.repos}</td>
                  <td className="px-3 py-2 tabular-nums font-semibold text-foreground">{numberFmt.format(user.reviewCount)}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{user.avgScore !== null ? user.avgScore : "–"}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{user.monthlyUsage}/{user.monthlyLimit === -1 ? "∞" : user.monthlyLimit}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatRelative(user.lastReviewAt)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(user.createdAt)}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end">
                      {user.hasPolarSubscription ? (
                        <span className="text-[9px] italic text-muted-foreground" title="Managed by Polar checkout - changes must happen in Polar">Polar-managed</span>
                      ) : user.plan === "pro" && user.compProUntil ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] text-rose-600 dark:text-rose-400 border-rose-500/40 hover:bg-rose-500/10"
                          disabled={isPending && pendingAction?.userId === user.id}
                          onClick={() => runCompAction(user.id, "revoke")}
                        >
                          {isPending && pendingAction?.userId === user.id && pendingAction?.action === "revoke" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
                          Revoke Pro
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] border-primary/40 text-primary hover:bg-primary/10"
                          disabled={isPending && pendingAction?.userId === user.id}
                          onClick={() => runCompAction(user.id, "grant")}
                        >
                          {isPending && pendingAction?.userId === user.id && pendingAction?.action === "grant" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          Grant 1-mo Pro
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length > showUsers && (
            <button onClick={() => setShowUsers((value) => value + 25)} className="w-full border-t border-border/60 py-2 text-center text-xs text-muted-foreground transition hover:bg-muted/30">
              Show more ({filteredUsers.length - showUsers} remaining)
            </button>
          )}
        </CardContent>
      </Card>

      {/* ── Recent reviews + top usage ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-primary" /> Recent reviews ({data.recentReviews.length})</CardTitle></CardHeader>
          <CardContent className="max-h-[440px] space-y-2 overflow-y-auto">
            {data.recentReviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reviews yet.</p>
            ) : data.recentReviews.map((review) => (
              <div key={review.id} className="flex items-start gap-2 rounded-lg border border-border/60 p-2.5 text-xs">
                <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${review.status === "completed" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"}`}>
                  {review.status === "completed" ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <a href={review.prUrl ?? "#"} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 font-medium text-foreground hover:underline">
                      <span className="truncate">{review.owner}/{review.repo} #{review.prNumber}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                    </a>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{review.score !== null ? `${review.score}/10` : "–"}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] text-muted-foreground">{review.prTitle ?? "Untitled PR"}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span className="truncate">{review.userName} ({review.userEmail})</span>
                    <span className="shrink-0">{review.reviewerModel ?? "unknown model"} · {formatRelative(review.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Flame className="h-4 w-4 text-orange-500" /> Top usage this month</CardTitle></CardHeader>
          <CardContent className="max-h-[440px] space-y-2 overflow-y-auto">
            {data.usageTopUsers.map((user, index) => (
              <div key={user.id} className="flex items-center gap-3 rounded-lg border border-border/60 p-2.5 text-xs">
                <span className="w-6 shrink-0 text-center font-bold text-muted-foreground tabular-nums">#{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{user.name || user.email}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{user.email} · <Badge className={`${PLAN_BADGE[user.plan] ?? ""} text-[9px]`}>{user.plan}</Badge></p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular-nums font-semibold text-foreground">{user.monthlyUsage}</p>
                  <p className="text-[10px] text-muted-foreground">of {user.monthlyLimit === -1 ? "∞" : user.monthlyLimit}</p>
                </div>
              </div>
            ))}
            {data.usageTopUsers.length === 0 && <p className="text-sm text-muted-foreground">No usage yet this month.</p>}

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-700 dark:text-amber-300">
              <p className="font-semibold"><TrendingUp className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />Watch the quota</p>
              Free users hit their monthly cap and silently get &ldquo;limit reached&rdquo; comments. If a user stops getting reviews, this table is where you look first.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
