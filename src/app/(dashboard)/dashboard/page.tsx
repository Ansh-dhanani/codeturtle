import React, { Suspense } from 'react'
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
import { getDashboardStats, getMonthlyActivity, getContributionGraph } from '@/module/dashboard/actions'
import { MonthlyActivityChart } from '@/components/charts/MonthlyActivityChart'
import { Skeleton } from '@/components/ui/skeleton'

async function DashboardStats() {
  const stats = await getDashboardStats()

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Repositories</CardTitle>
          <GitBranch className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalRepos}</div>
          <p className="text-xs text-muted-foreground">
            Connected repositories
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Commits</CardTitle>
          <GitCommit className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalCommits}</div>
          <p className="text-xs text-muted-foreground">
            This year
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pull Requests</CardTitle>
          <GitPullRequest className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalPRs}</div>
          <p className="text-xs text-muted-foreground">
            Created this year
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">AI Reviews</CardTitle>
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalAIReviews}</div>
          <p className="text-xs text-muted-foreground">
            Code reviews completed
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

async function MonthlyActivity() {
  const monthlyActivity = await getMonthlyActivity()

  // getMonthlyActivity now returns default data instead of null during prerendering
  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Activity</CardTitle>
        <CardDescription>
          Your coding activity over the last 12 months
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MonthlyActivityChart data={monthlyActivity} isLoading={false} />
      </CardContent>
    </Card>
  )
}

async function ContributionGraphServer() {
  const contributionData = await getContributionGraph()

  return (
    <div className="w-full">
      <div className="text-sm text-muted-foreground mb-2">
        {contributionData.totalContributions} contributions in the last year
      </div>
      <div className="text-xs text-muted-foreground">
        Less <span className="inline-block w-2 h-2 bg-muted rounded-sm mx-1"></span>
        <span className="inline-block w-2 h-2 bg-blue-200 rounded-sm mx-1"></span>
        <span className="inline-block w-2 h-2 bg-blue-300 rounded-sm mx-1"></span>
        <span className="inline-block w-2 h-2 bg-blue-400 rounded-sm mx-1"></span>
        <span className="inline-block w-2 h-2 bg-blue-500 rounded-sm mx-1"></span> More
      </div>
    </div>
  )
}

function DashboardStatsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function MonthlyActivitySkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-64 w-full" />
      </CardContent>
    </Card>
  )
}

export default function Page() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your monthly activity and stats
        </p>
      </div>

      {/* Stats */}
      <Suspense fallback={<DashboardStatsSkeleton />}>
        <DashboardStats />
      </Suspense>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Suspense fallback={<MonthlyActivitySkeleton />}>
          <MonthlyActivity />
        </Suspense>

        <Card>
          <CardHeader>
            <CardTitle>Contribution Graph</CardTitle>
            <CardDescription>
              Your GitHub contribution activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-32 w-full" />}>
              <ContributionGraphServer />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
