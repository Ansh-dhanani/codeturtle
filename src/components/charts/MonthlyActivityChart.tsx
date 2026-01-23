'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import {
  ChartTooltip,
  ChartTooltipContent,
  ChartContainer,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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

const chartConfig = {
  reviews: {
    label: 'AI Reviews',
    color: '#f59e0b',
  },
  prs: {
    label: 'PRs',
    color: '#10b981',
  },
} satisfies ChartConfig

const CustomLegend = () => (
  <TooltipProvider>
    <div className="flex justify-center gap-4 text-xs pt-2">
      {Object.values(chartConfig).map((item) => (
        <Tooltip key={item.label}>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 cursor-pointer">
              <span
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-muted-foreground">{item.label}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>{item.label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  </TooltipProvider>
)
//this is montly
export function MonthlyActivityChart({
  data,
  isLoading,
}: MonthlyActivityChartProps) {
  const chartData = useMemo(() => data ?? [], [data])

  return (
    <div className="flex flex-col justify-between min-h-80">
      {/* Chart Area */}
      <div className="flex-1">
        {isLoading ? (
          <div className="flex min-h-60 items-center justify-center text-sm text-muted-foreground">
            <Spinner className="mr-2" /> Loading monthly activity data...
          </div>
        ) : (
          <ChartContainer config={chartConfig}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 12, right: 16, left: 0, bottom: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  strokeOpacity={0.2}
                  vertical={false}
                />

                <XAxis
                  dataKey="name"
                  height={24}
                  tickLine={false}
                  axisLine={false}
                />

                <YAxis
                  width={32}
                  tickLine={false}
                  axisLine={false}
                />

                <ChartTooltip content={<ChartTooltipContent />} />

                <defs>
                  <linearGradient id="prsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="80%" stopColor="#10b981" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient
                    id="reviewsGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                    <stop offset="80%" stopColor="#f59e0b" stopOpacity={0.1} />
                  </linearGradient>
                </defs>

                <Area
                  type="monotone"
                  dataKey="reviews"
                  stroke={chartConfig.reviews.color}
                  fill="url(#reviewsGradient)"
                  strokeWidth={2}
                  dot={false}
                />

                <Area
                  type="monotone"
                  dataKey="prs"
                  stroke={chartConfig.prs.color}
                  fill="url(#prsGradient)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </div>

      {/* Legend */}
      <CustomLegend />
    </div>
  )
}
