"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const config = {
  emails: { label: "Emails", color: "var(--chart-1)" },
  replies: { label: "Replies", color: "var(--chart-2)" },
  hot: { label: "Hot leads", color: "#d97706" },
} satisfies ChartConfig

export function UsageAreaChart({
  data,
}: {
  data: Array<{ date: string; emails: number; replies: number; hot: number }>
}) {
  return (
    <ChartContainer config={config} className="h-56 w-full">
      <AreaChart data={data} margin={{ left: -12, right: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          dataKey="emails"
          type="monotone"
          fill="var(--color-emails)"
          stroke="var(--color-emails)"
          fillOpacity={0.18}
          strokeWidth={2}
        />
        <Area
          dataKey="replies"
          type="monotone"
          fill="var(--color-replies)"
          stroke="var(--color-replies)"
          fillOpacity={0.18}
          strokeWidth={2}
        />
        <Area
          dataKey="hot"
          type="monotone"
          fill="var(--color-hot)"
          stroke="var(--color-hot)"
          fillOpacity={0.2}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  )
}
