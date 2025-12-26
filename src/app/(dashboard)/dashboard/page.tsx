'use client'

import React from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  GitCommit,
  GitPullRequest,
  MessageSquare,
  GitBranch,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  getDashboardStats,
  getMonthlyActivity,
} from '@/module/dashboard/actions'
import ContributionGraph from '@/components/github/contributionGraph'
import { MonthlyActivityChart } from '@/components/charts/MonthlyActivityChart'

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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your monthly activity and stats
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          {
            title: 'Total Repositories',
            value: stats?.totalRepos,
            icon: GitBranch,
          },
          {
            title: 'Total Commits',
            value: stats?.totalCommits,
            icon: GitCommit,
          },
          {
            title: 'Total PRs',
            value: stats?.totalPRs,
            icon: GitPullRequest,
          },
          {
            title: 'AI Reviews',
            value: stats?.totalAIReviews,
            icon: MessageSquare,
          },
        ].map((item, i) => (
          <Card
            key={i}
            className="group relative transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {item.title}
              </CardTitle>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted transition-colors group-hover:bg-primary/10">
                <item.icon className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">
                {isStatsLoading ? '—' : item.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Contribution Chart */}
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Contribution Activity</CardTitle>
        </CardHeader>
        <CardContent className="min-h-[300px]">
          <ContributionGraph />
        </CardContent>
      </Card>

      {/* Monthly Activity Chart */}
      <Card className="w-full">
        <CardHeader className="space-y-1">
          <CardTitle>Monthly Activity (Last 6 Months)</CardTitle>
          <CardDescription>
            Overview of PRs, and reviews
          </CardDescription>
        </CardHeader>

        {/* Height contract lives HERE */}
        <CardContent className="min-h-[280px] sm:min-h-[320px] lg:min-h-[360px]">
          <MonthlyActivityChart
            data={monthlyActivity ?? []}
            isLoading={isMonthlyActivityLoading}
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default Page
