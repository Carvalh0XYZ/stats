import * as React from "react"
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts"

import { AGENTS } from "@/lib/agents/registry"
import type { AgentId } from "@/lib/agents/registry"
import type { AgentPoint, TimeSeries, TokenTotals } from "@/lib/api/types"
import { formatCost, formatCount, formatTokens } from "@/components/data/format"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useCountUp } from "@/hooks/use-count-up"
import { cn } from "@/lib/utils"

export type SeriesMetric = "tokens" | "cost" | "events"

const DAY_MS = 86_400_000

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

// --- Contributions heat grid ---

const GRID_ROWS = 7

/** Tiers 1 (least) → 5 (most activity); tier 0 is the grey track. */
const TIER_CLASSES = [
  "bg-chart-track",
  "bg-blue-200 dark:bg-blue-950",
  "bg-blue-400 dark:bg-blue-800",
  "bg-blue-500 dark:bg-blue-600",
  "bg-blue-600 dark:bg-blue-500",
  "bg-blue-700 dark:bg-blue-400",
]

/**
 * Deterministic per-cell hash (SSR-safe). A plain linear seed reads as
 * visibly diagonal/striped; this mixes the bits so animation delays look
 * scattered instead of patterned.
 */
function hashCell(row: number, col: number) {
  let h = row * 374761393 + col * 668265263
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

/** Map a real count onto the 5-tier color ramp (0 = the grey track). */
function tierForCount(count: number, max: number) {
  if (count <= 0) return 0
  return 1 + Math.min(4, Math.floor((count / Math.max(max, 1)) * 5))
}

export interface ContributionDatum {
  count: number
  /** Tooltip line — "1.2M tokens on Apr 26". */
  label: string
}

/**
 * Heatmap grid — quantized accent ramp, a tooltip per cell, and a scattered
 * pop-in on mount. `data` is sequential days, column-major (7 rows per week
 * column).
 */
export function ContributionsGrid({
  data,
  max,
  className,
}: {
  data: ContributionDatum[]
  /** Intensity ceiling. Defaults to the max count. */
  max?: number
  className?: string
}) {
  const cols = Math.ceil(data.length / GRID_ROWS)
  const ceiling = max ?? Math.max(...data.map((d) => d.count), 1)

  return (
    <TooltipProvider>
      <div
        className={cn("grid gap-1", className)}
        style={{ gridTemplateColumns: `repeat(${cols}, 13px)` }}
      >
        {Array.from({ length: GRID_ROWS }, (_, row) =>
          Array.from({ length: cols }, (_2, col) => {
            const index = col * GRID_ROWS + row
            if (index >= data.length)
              return <span key={`${row}-${col}`} aria-hidden />
            const cell = data[index]
            const tier = tierForCount(cell.count, ceiling)
            return (
              <Tooltip key={`${row}-${col}`}>
                <TooltipTrigger
                  aria-label={cell.label}
                  tabIndex={-1}
                  className={cn(
                    "aspect-square w-full cursor-default rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    TIER_CLASSES[tier],
                    tier > 0 && "animate-cell-pop"
                  )}
                  style={
                    tier > 0
                      ? // Reuse the cell hash (different bits) for a scattered 0–800ms delay
                        { animationDelay: `${(hashCell(row, col) >>> 7) % 800}ms` }
                      : undefined
                  }
                />
                <TooltipContent>{cell.label}</TooltipContent>
              </Tooltip>
            )
          })
        )}
      </div>
    </TooltipProvider>
  )
}

/** Daily heatmap over the last year, with month labels under the grid. */
export function ActivityCalendar({ series }: { series: TimeSeries }) {
  const days = new Map<string, number>()
  for (const point of series.points) {
    days.set(new Date(point.t).toISOString().slice(0, 10), point.tokens)
  }

  // Columns are weeks; pad the first week to start on Sunday.
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 364)
  start.setDate(start.getDate() - start.getDay())

  const data: ContributionDatum[] = []
  const months: string[] = []
  let lastMonth = -1
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10)
    const tokens = days.get(key) ?? 0
    const date = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })
    data.push({
      count: tokens,
      label:
        tokens === 0
          ? `No tokens on ${date}`
          : `${formatTokens(tokens)} tokens on ${date}`,
    })
    if (d.getMonth() !== lastMonth) {
      lastMonth = d.getMonth()
      months.push(d.toLocaleDateString(undefined, { month: "short" }))
    }
  }

  return (
    <div
      ref={(node) => {
        // Recent days sit at the right edge; start the scroll there.
        if (node) node.scrollLeft = node.scrollWidth
      }}
      className="overflow-x-auto"
    >
      <div className="flex w-max flex-col gap-1.5">
        <ContributionsGrid data={data} />
        <div className="flex w-full justify-between text-[11px] font-medium text-muted-foreground">
          {months.slice(1).map((month, i) => (
            <span key={i}>{month}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- Usage line chart ---

const METRIC_LABELS: Record<SeriesMetric, string> = {
  tokens: "Tokens",
  cost: "Cost",
  events: "Events",
}

function metricValue(point: TimeSeries["points"][number], metric: SeriesMetric) {
  return metric === "cost"
    ? point.costUsd
    : metric === "events"
      ? point.events
      : point.tokens
}

function formatMetric(value: number, metric: SeriesMetric) {
  if (metric === "cost") return formatCost(value)
  if (metric === "events") return `${formatCount(Math.round(value))} events`
  return `${formatTokens(Math.round(value))} tokens`
}

const MAX_AGENT_LINES = 5

const LINE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

/**
 * Per-agent lines for the top agents by the chosen metric. Agents beyond
 * the top five are omitted: their near-zero values draw as a flat line
 * pinned to the baseline.
 */
function buildAgentLines(series: TimeSeries, metric: SeriesMetric) {
  const pick = (slice: AgentPoint) =>
    metric === "cost"
      ? slice.costUsd
      : metric === "events"
        ? slice.events
        : slice.tokens
  const totals = new Map<AgentId, number>()
  for (const point of series.points) {
    for (const [agent, slice] of Object.entries(point.byAgent)) {
      totals.set(agent as AgentId, (totals.get(agent as AgentId) ?? 0) + pick(slice))
    }
  }
  const keys = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_AGENT_LINES)
    .map(([agent]) => agent)

  const labels = keys.map((agent) => AGENTS[agent].label)
  const rows = series.points.map((point) => {
    const row: Record<string, number> = {}
    for (const agent of keys) row[agent] = 0
    for (const [agent, slice] of Object.entries(point.byAgent)) {
      if (keys.includes(agent as AgentId)) row[agent] = pick(slice)
    }
    return row
  })

  return { keys, labels, rows }
}

/** Active point marker — a pulsing dot; grey on idle days. */
function PulsingDot(props: {
  cx?: number
  cy?: number
  payload?: { value?: number }
  color?: string
}) {
  const { cx: x, cy: y, payload } = props
  if (x == null || y == null) return null
  const color =
    props.color ??
    (payload?.value === 0 ? "var(--muted-foreground)" : "var(--chart-1)")
  return (
    <g>
      <circle cx={x} cy={y} r={5} fill={color} opacity={0.3}>
        <animate attributeName="r" values="5;13" dur="1.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.35;0" dur="1.4s" repeatCount="indefinite" />
      </circle>
      <circle
        cx={x}
        cy={y}
        r={5}
        fill={color}
        stroke="var(--background)"
        strokeWidth={3}
      />
    </g>
  )
}

/** Solid-segment marker — skips zero days (the boundary points shared with a
 *  dashed segment), so those only get the dashed line's grey dot. */
function SolidDot(props: {
  cx?: number
  cy?: number
  payload?: { value?: number }
}) {
  if (props.payload?.value === 0) return null
  return <PulsingDot {...props} />
}

/**
 * Cut the series into alternating solid/dashed segments. Dashed segments are
 * the zero runs; solid segments span between them and include the bounding
 * zero on each side (so the line touches the baseline before the grey
 * dashes take over).
 */
function buildSegments(series: { value: number }[]) {
  const segments: { key: string; dashed: boolean; from: number; to: number }[] =
    []
  let i = 0
  while (i < series.length) {
    const zero = series[i].value === 0
    let end = i
    while (end + 1 < series.length && (series[end + 1].value === 0) === zero)
      end++
    if (zero) {
      segments.push({ key: `idle-${i}`, dashed: true, from: i, to: end })
    } else {
      // Extend one point into the neighbouring zero runs for the descent/climb
      segments.push({
        key: `run-${i}`,
        dashed: false,
        from: Math.max(0, i - 1),
        to: Math.min(series.length - 1, end + 1),
      })
    }
    i = end + 1
  }

  const data = series.map((point, index) => {
    const row: Record<string, number | null> & { value: number } = { ...point }
    for (const seg of segments) {
      row[seg.key] = index >= seg.from && index <= seg.to ? point.value : null
    }
    return row
  })

  return { segments, data }
}

/**
 * Chart card: an accent line over a gradient area, grey
 * dashed baseline through zero runs, and a count-up headline that rolls to
 * the hovered point's value.
 */
export function UsageChartCard({
  series,
  metric = "tokens",
  total,
  className,
}: {
  series: TimeSeries
  metric?: SeriesMetric
  /** Idle headline. Defaults to the series sum. */
  total?: number
  className?: string
}) {
  const gradientId = React.useId()
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null)

  const points = series.points
  const values = React.useMemo(
    () => points.map((p) => ({ value: metricValue(p, metric) })),
    [points, metric]
  )
  const { segments, data } = React.useMemo(
    () => buildSegments(values),
    [values]
  )
  // Buckets carry per-agent slices: draw one line per agent when 2+ exist.
  const agents = React.useMemo(
    () => buildAgentLines(series, metric),
    [series, metric]
  )
  const multi = agents.keys.length > 1
  const rows = React.useMemo(
    () =>
      multi ? data.map((row, i) => ({ ...row, ...agents.rows[i] })) : data,
    [multi, data, agents]
  )

  const hovering = activeIndex !== null && activeIndex < points.length
  const target = hovering
    ? values[activeIndex].value
    : (total ?? values.reduce((sum, v) => sum + v.value, 0))
  const label = hovering
    ? formatBucketTick(points[activeIndex].t, series.bucketMs)
    : METRIC_LABELS[metric]
  // Animate in hundredths so cost cents roll too (useCountUp rounds to ints)
  const display = useCountUp(Math.round(target * 100)) / 100

  return (
    <section
      className={cn(
        "flex w-full flex-col rounded-2xl bg-muted/50 py-4",
        className
      )}
    >
      {/* Header — overlaps the top of the plot */}
      <div className="relative z-10 -mb-8 flex w-full px-5 pt-1">
        <div className="flex flex-col gap-0.5">
          <p className="text-[13px] whitespace-nowrap text-muted-foreground">
            {label}
          </p>
          <p
            key={`${metric}:${activeIndex}`}
            className="animate-number-fade text-xl font-semibold tracking-tight whitespace-nowrap tabular-nums"
          >
            {formatMetric(display, metric)}
          </p>
        </div>
      </div>

      {/* Plot — clip-path sweep draws the line + area in left→right */}
      <div className="animate-chart-reveal h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            // 2px bottom room so the 2px stroke isn't clipped on zero days
            margin={{ top: 27, right: 0, bottom: 2, left: 0 }}
            onMouseMove={(state) => {
              const index = Number(state.activeTooltipIndex)
              if (state.isTooltipActive && Number.isInteger(index)) {
                setActiveIndex(index)
              } else {
                setActiveIndex(null)
              }
            }}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.32} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <RechartsTooltip
              content={() => null}
              cursor={{
                stroke: "var(--color-chart-cursor)",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
            />
            {/* Sharp joins on purpose: type="linear", not monotone.
                No area in multi mode: the total's shade would float above
                the per-agent lines. */}
            {multi ? null : (
              <Area
                type="linear"
                dataKey="value"
                stroke="none"
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
              />
            )}
            {/* Alternating segments: dashed grey along zero runs, solid accent
                (incl. the descent/climb touching the baseline) in between.
                Multi-agent mode draws one colored line per agent instead. */}
            {multi
              ? agents.keys.map((key, index) => (
                  <Line
                    key={key}
                    type="linear"
                    dataKey={key}
                    stroke={LINE_COLORS[index % LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={
                      <PulsingDot
                        color={LINE_COLORS[index % LINE_COLORS.length]}
                      />
                    }
                    isAnimationActive={false}
                  />
                ))
              : segments.map((seg) => (
                  <Line
                    key={seg.key}
                    type="linear"
                    dataKey={seg.key}
                    stroke={
                      seg.dashed ? "var(--muted-foreground)" : "var(--chart-1)"
                    }
                    strokeWidth={2}
                    strokeDasharray={seg.dashed ? "5 5" : undefined}
                    dot={false}
                    activeDot={seg.dashed ? <PulsingDot /> : <SolidDot />}
                    // The container's clip-path reveal handles the entrance;
                    // recharts' own interpolation would fight it.
                    isAnimationActive={false}
                  />
                ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* X axis */}
      {points.length > 0 ? (
        <div className="mt-2 flex w-full items-start justify-between px-5 text-[11px] font-medium whitespace-nowrap text-muted-foreground">
          <p>{formatBucketTick(points[0].t, series.bucketMs)}</p>
          <p>{formatBucketTick(points[points.length - 1].t, series.bucketMs)}</p>
        </div>
      ) : null}

      {/* Legend — one entry per agent line */}
      {multi ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-5">
          {agents.keys.map((key, index) => (
            <span
              key={key}
              className="flex items-center gap-1.5 text-[13px] text-muted-foreground"
            >
              <span
                aria-hidden
                className="size-2.5 rounded-[3px]"
                style={{ background: LINE_COLORS[index % LINE_COLORS.length] }}
              />
              {agents.labels[index]}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  )
}
