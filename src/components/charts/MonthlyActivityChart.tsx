'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts'
import { useMemo } from 'react'
import { Spinner } from '../ui/spinner'

interface MonthlyActivityData {
  name: string
  commits: number
  prs: number
  reviews: number
}

interface MonthlyActivityChartProps {
  data: MonthlyActivityData[]
  isLoading: boolean
}

export function MonthlyActivityChart({
  data,
  isLoading,
}: MonthlyActivityChartProps) {
  const chartData = useMemo(() => data ?? [], [data])

  return (
    <div className="flex flex-col justify-between min-h-80">
      <div className="flex-1">
        {isLoading ? (
          <div className="flex min-h-60 items-center justify-center text-sm text-muted-foreground">
            <Spinner className="mr-2" /> Loading monthly activity data...
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} vertical={false} />
                <XAxis dataKey="name" height={24} tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "var(--muted-foreground)" }} />
                <YAxis width={32} tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "var(--muted-foreground)" }} />
                <Tooltip
                  cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <defs>
                  <linearGradient id="prsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="80%" stopColor="#10b981" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="reviewsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                    <stop offset="80%" stopColor="#f59e0b" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="reviews" stroke="#f59e0b" fill="url(#reviewsGradient)" strokeWidth={2} dot={false} name="AI Reviews" />
                <Area type="monotone" dataKey="prs" stroke="#10b981" fill="url(#prsGradient)" strokeWidth={2} dot={false} name="PRs" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
