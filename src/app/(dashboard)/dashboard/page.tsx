'use client'

import React, { useMemo } from 'react'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuery } from '@tanstack/react-query'
import {
  getDashboardStats,
  getMonthlyActivity,
} from '@/module/dashboard/actions'
import ContributionGraph from '@/components/github/contributionGraph'
import { MonthlyActivityChart } from '@/components/charts/MonthlyActivityChart'
import { ArrowRight } from 'lucide-react'

const Page = () => {
  const {
    data: monthlyActivity,
    isLoading: isMonthlyActivityLoading,
  } = useQuery({
    queryKey: ['monthly-activity'],
    queryFn: async () => await getMonthlyActivity(),
    refetchOnWindowFocus: false,
  })

  const {
    data: stats,
    isLoading: isStatsLoading,
  } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => await getDashboardStats(),
    refetchOnWindowFocus: false,
  })

  const thisMonth = useMemo(() => {
    if (!monthlyActivity || monthlyActivity.length === 0) return null
    return monthlyActivity[monthlyActivity.length - 1]
  }, [monthlyActivity])

  const metrics = [
    {
      label: 'Repositories',
      value: stats?.totalRepos,
      sub: 'Connected',
      href: '/repositories',
    },
    {
      label: 'Contributions',
      value: stats?.totalCommits,
      sub: 'Last 12 months',
      href: '/analytics',
    },
    {
      label: 'Pull Requests',
      value: stats?.totalPRs,
      sub: 'Authored',
      href: '/analytics',
    },
    {
      label: 'AI Reviews',
      value: stats?.totalAIReviews,
      sub: 'Completed',
      href: '/reviews',
    },
  ]

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Activity and review status for your account.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/reviews">Reviews</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/repositories">Connect repository</Link>
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <Link
            key={m.label}
            href={m.href}
            className="group flex flex-col justify-between bg-background p-5 transition-colors hover:bg-muted/40"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{m.label}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <div className="mt-3">
              {isStatsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <span className="text-3xl font-semibold tabular-nums tracking-tight">
                  {(m.value ?? 0).toLocaleString()}
                </span>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{m.sub}</p>
            </div>
          </Link>
        ))}
      </section>

      {/* This month */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">This month</h2>
          <span className="text-xs text-muted-foreground">
            {thisMonth?.name ?? '-'}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Contributions', value: thisMonth?.commits, note: 'GitHub contributions' },
            { label: 'Pull requests', value: thisMonth?.prs, note: 'Opened by you' },
            { label: 'AI reviews', value: thisMonth?.reviews, note: 'Completed' },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border bg-card p-4"
            >
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {item.label}
              </p>
              {isMonthlyActivityLoading ? (
                <Skeleton className="mt-2 h-7 w-12" />
              ) : (
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {(item.value ?? 0).toLocaleString()}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contribution graph */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">Contribution activity</h2>
          <p className="text-xs text-muted-foreground">
            GitHub contributions over the last year.
          </p>
        </div>
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5 lg:p-6">
            <ContributionGraph />
          </CardContent>
        </Card>
      </section>

      {/* Monthly chart + activity */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div>
            <h2 className="text-sm font-medium">Review activity</h2>
            <p className="text-xs text-muted-foreground">
              Pull requests and AI reviews, last 6 months.
            </p>
          </div>
          <Card className="shadow-none">
            <CardContent className="min-h-[280px] sm:min-h-[320px] lg:min-h-[360px] pt-6">
              <MonthlyActivityChart
                data={monthlyActivity ?? []}
                isLoading={isMonthlyActivityLoading}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-medium">Shortcuts</h2>
            <p className="text-xs text-muted-foreground">Jump to common tasks.</p>
          </div>
          <Card className="shadow-none">
            <CardContent className="p-0">
              <div className="divide-y">
                {[
                  { label: 'Repositories', desc: 'Connect and manage repos', href: '/repositories' },
                  { label: 'Reviews', desc: 'Browse AI review history', href: '/reviews' },
                  { label: 'Analytics', desc: 'Usage and trends', href: '/analytics' },
                  { label: 'Settings', desc: 'Account and preferences', href: '/settings' },
                ].map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {!isStatsLoading && (stats?.totalAIReviews ?? 0) === 0 && (
            <div className="rounded-lg border border-dashed p-4">
              <p className="text-sm font-medium">Get your first review</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Connect a repository and open a pull request.
              </p>
              <Button asChild size="sm" className="mt-3" variant="outline">
                <Link href="/repositories">Get started</Link>
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default Page
