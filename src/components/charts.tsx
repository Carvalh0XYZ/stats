import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { AGENTS, type AgentId } from "@/lib/agents/registry"
import type { TimeSeries, TokenTotals } from "@/lib/api/types"
import { formatCost, formatTokens } from "@/components/data/format"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export type SeriesMetric = "tokens" | "cost" | "events"

const DAY_MS = 86_400_000
const MAX_STACKED_AGENTS = 5

/**
 * Stacked-by-agent area chart for the tokens metric; single series for
 * cost/events (byAgent only carries tokens on the wire).
 */
export function UsageAreaChart({
  series,
  metric,
}: {
  series: TimeSeries
  metric: SeriesMetric
}) {
  const { data, keys, config } = React.useMemo(
    () => buildSeriesData(series, metric),
    [series, metric]
  )

  const formatValue = metric === "cost" ? formatCost : formatTokens

  return (
    <ChartContainer
      config={config}
      className="h-64 w-full [&_.recharts-cartesian-axis-tick_text]:font-mono [&_.recharts-cartesian-axis-tick_text]:text-[11px]"
    >
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid
          vertical={false}
          strokeDasharray="3 3"
          stroke="var(--border)"
        />
        <XAxis
          dataKey="t"
          tickLine={false}
          axisLine={false}
          minTickGap={32}
          tickFormatter={(t: number) => formatBucketTick(t, series.bucketMs)}
        />
        <YAxis
          width={48}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) =>
            metric === "cost" ? formatCost(v) : formatTokens(v)
          }
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const t = payload?.[0]?.payload?.t as number | undefined
                return t === undefined ? "" : new Date(t).toLocaleString()
              }}
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">
                    {config[String(name)]?.label ?? String(name)}
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatValue(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        {keys.map((key, index) => (
          <Area
            key={key}
            dataKey={key}
            stackId="usage"
            type="monotone"
            fill={`var(--chart-${(index % 5) + 1})`}
            fillOpacity={0.18}
            stroke={`var(--chart-${(index % 5) + 1})`}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  )
}

function buildSeriesData(series: TimeSeries, metric: SeriesMetric) {
  if (metric !== "tokens") {
    const key = metric === "cost" ? "costUsd" : "events"
    const config: ChartConfig = {
      [key]: { label: metric === "cost" ? "Cost" : "Events" },
    }
    return {
      data: series.points.map((p) => ({
        t: p.t,
        [key]: metric === "cost" ? p.costUsd : p.events,
      })),
      keys: [key],
      config,
    }
  }

  const totals = new Map<AgentId, number>()
  for (const point of series.points) {
    for (const [agent, tokens] of Object.entries(point.byAgent)) {
      totals.set(
        agent as AgentId,
        (totals.get(agent as AgentId) ?? 0) + (tokens ?? 0)
      )
    }
  }
  const top = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_STACKED_AGENTS)
    .map(([agent]) => agent)
  const hasOther = totals.size > top.length

  const keys: string[] = [...top, ...(hasOther ? ["other"] : [])]
  const config: ChartConfig = {}
  for (const key of keys) {
    config[key] = {
      label: key === "other" ? "Other" : AGENTS[key as AgentId].label,
    }
  }

  const data = series.points.map((point) => {
    const row: Record<string, number> = { t: point.t }
    for (const agent of top) row[agent] = point.byAgent[agent] ?? 0
    if (hasOther) {
      let other = 0
      for (const [agent, tokens] of Object.entries(point.byAgent)) {
        if (!top.includes(agent as AgentId)) other += tokens ?? 0
      }
      row["other"] = other
    }
    return row
  })

  return { data, keys, config }
}

function formatBucketTick(t: number, bucketMs: number): string {
  const date = new Date(t)
  if (bucketMs < DAY_MS) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

const TOKEN_PARTS: { key: keyof TokenTotals; label: string }[] = [
  { key: "input", label: "Input" },
  { key: "output", label: "Output" },
  { key: "cacheRead", label: "Cache read" },
  { key: "cacheWrite", label: "Cache write" },
  { key: "reasoning", label: "Reasoning" },
]

/** Single horizontal stacked bar showing the token mix, with a labeled legend. */
export function TokenMixBar({ tokens }: { tokens: TokenTotals }) {
  const total = tokens.total > 0 ? tokens.total : 1
  const parts = TOKEN_PARTS.map((part, index) => ({
    ...part,
    value: tokens[part.key],
    color: `var(--chart-${index + 1})`,
  })).filter((part) => part.value > 0)

  if (parts.length === 0) {
    return <p className="text-sm text-muted-foreground">No tokens in range</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={parts
          .map((p) => `${p.label} ${formatTokens(p.value)}`)
          .join(", ")}
      >
        {parts.map((part) => (
          <div
            key={part.key}
            className="h-full min-w-1 shrink-0"
            style={{
              width: `${(part.value / total) * 100}%`,
              background: part.color,
            }}
          />
        ))}
      </div>
      <dl className="flex flex-col">
        {parts.map((part) => (
          <div key={part.key} className="flex items-center gap-2 py-[5px]">
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ background: part.color }}
              aria-hidden
            />
            <dt className="min-w-0 flex-1 truncate text-sm">{part.label}</dt>
            <dd className="font-mono text-[13px] text-muted-foreground tabular-nums">
              {formatTokens(part.value)}
            </dd>
            <dd className="w-14 text-right text-[13px] font-medium tabular-nums">
              {((part.value / total) * 100).toFixed(1)}%
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** GitHub-style daily heatmap built from a daily-bucketed year time series. */
export function ActivityCalendar({ series }: { series: TimeSeries }) {
  const days = new Map<string, number>()
  let max = 0
  for (const point of series.points) {
    const key = new Date(point.t).toISOString().slice(0, 10)
    days.set(key, point.tokens)
    if (point.tokens > max) max = point.tokens
  }

  // Calendar columns are weeks; pad the first week to start on Sunday.
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 364)
  start.setDate(start.getDate() - start.getDay())

  const weeks: { date: string; tokens: number }[][] = []
  let week: { date: string; tokens: number }[] = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10)
    week.push({ date: key, tokens: days.get(key) ?? 0 })
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) weeks.push(week)

  return (
    <div
      ref={(node) => {
        // Recent days sit at the right edge; start the scroll there.
        if (node) node.scrollLeft = node.scrollWidth
      }}
      className="overflow-x-auto"
    >
      <div
        className="flex w-max gap-0.5"
        role="img"
        aria-label="Daily activity for the last year"
      >
        {weeks.map((column, wi) => (
          <div key={wi} className="flex flex-col gap-0.5">
            {column.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${formatTokens(day.tokens)} tokens`}
                className="size-2.5 rounded-xs"
                style={{
                  background:
                    day.tokens === 0
                      ? "var(--muted)"
                      : `color-mix(in oklch, var(--chart-1) ${
                          25 + Math.round((day.tokens / (max || 1)) * 75)
                        }%, var(--muted))`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
