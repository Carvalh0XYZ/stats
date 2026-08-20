import { createFileRoute, Link } from "@tanstack/react-router"

import { AGENTS } from "@/lib/agents/registry"
import type {
  BreakdownRow,
  OverviewStats,
  SessionPage,
  StatsFilter,
  TimeSeries,
} from "@/lib/api/types"
import { getJson, parseStatsSearch, statsUrl } from "@/components/data/api"
import {
  formatCost,
  formatCount,
  formatDuration,
  formatRelative,
  formatShare,
  formatTokens,
} from "@/components/data/format"
import { usePoll } from "@/components/data/use-poll"
import {
  ActivityCalendar,
  TokenMixBar,
  UsageAreaChart,
} from "@/components/charts"
import {
  EmptyState,
  ErrorState,
  PageSkeleton,
  SectionHeader,
} from "@/components/states"

export const Route = createFileRoute("/")({
  validateSearch: parseStatsSearch,
  component: OverviewPage,
})

interface OverviewData {
  overview: OverviewStats
  series: TimeSeries
  yearSeries: TimeSeries
  agents: BreakdownRow[]
  models: BreakdownRow[]
  sessions: SessionPage
}

function OverviewPage() {
  const filter = Route.useSearch()
  const poll = usePoll<OverviewData>(async () => {
    const yearFilter: StatsFilter = { range: "year", agents: filter.agents }
    const [overview, series, yearSeries, agents, models, sessions] =
      await Promise.all([
        getJson<OverviewStats>(statsUrl("overview", filter)),
        getJson<TimeSeries>(statsUrl("timeseries", filter)),
        getJson<TimeSeries>(statsUrl("timeseries", yearFilter)),
        getJson<BreakdownRow[]>(
          statsUrl("breakdown", filter, { dimension: "agent" })
        ),
        getJson<BreakdownRow[]>(
          statsUrl("breakdown", filter, { dimension: "model" })
        ),
        getJson<SessionPage>(
          statsUrl("sessions", filter, { page: "1", pageSize: "5" })
        ),
      ])
    return { overview, series, yearSeries, agents, models, sessions }
  }, JSON.stringify(filter))

  if (poll.error)
    return <ErrorState message={poll.error} onRetry={poll.refresh} />
  if (poll.loading || !poll.data) return <PageSkeleton />

  const { overview, series, yearSeries, agents, models, sessions } = poll.data
  const filtered = (filter.agents?.length ?? 0) > 0 || filter.range !== "all"
  if (overview.events === 0) return <EmptyState filtered={filtered} />

  const estimated = overview.hasEstimatedTokens

  return (
    <div className="flex flex-col">
      <h1 className="sr-only">Overview</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi
          className="pb-4 xl:pb-0"
          label="Total tokens"
          value={formatTokens(overview.tokens.total)}
          note={estimated ? "includes estimated" : undefined}
        />
        <Kpi
          className="border-l pb-4 pl-4 xl:pb-0"
          label="Priced cost"
          value={formatCost(overview.pricedCostUsd)}
          note={
            overview.unpricedEventCount > 0
              ? `+${formatCount(overview.unpricedEventCount)} unpriced`
              : undefined
          }
        />
        <Kpi
          className="border-t pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pb-4 sm:pl-4 xl:pb-0"
          label="Sessions"
          value={formatCount(overview.sessions)}
        />
        <Kpi
          className="border-t border-l pt-4 pl-4 sm:border-l-0 sm:pl-0 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-4"
          label="Active time"
          value={formatDuration(overview.activeTimeMs)}
          note={`${formatCount(overview.activeDays)} active days`}
        />
        <Kpi
          className="border-t pt-4 sm:border-l sm:pl-4 xl:border-t-0 xl:pt-0"
          label="Cache read share"
          value={formatShare(overview.cacheReadShare)}
        />
        <Kpi
          className="border-t border-l pt-4 pl-4 xl:border-t-0 xl:pt-0"
          label="Output tokens"
          value={formatTokens(overview.tokens.output)}
        />
      </div>

      <section className="mt-10 border-t pt-8">
        <SectionHeader
          title="Token usage"
          description="Stacked by agent over the selected range"
        />
        <UsageAreaChart series={series} metric="tokens" />
      </section>

      <div className="mt-10 grid gap-10 border-t pt-8 lg:grid-cols-2 lg:gap-12">
        <section className="min-w-0">
          <SectionHeader
            title="Daily activity"
            description="Tokens per day, last year"
          />
          <ActivityCalendar series={yearSeries} />
        </section>
        <section className="min-w-0">
          <SectionHeader
            title="Token mix"
            description={`Input, output, cache, and reasoning tokens${estimated ? " (some values estimated)" : ""}`}
          />
          <TokenMixBar tokens={overview.tokens} />
        </section>
      </div>

      <div className="mt-10 grid gap-10 border-t pt-8 lg:grid-cols-2 lg:gap-12">
        <TopList
          title="Top agents"
          rows={agents}
          to="/agents"
          filter={filter}
        />
        <TopList
          title="Top models"
          rows={models}
          to="/models"
          filter={filter}
        />
      </div>

      <section className="mt-10 border-t pt-8">
        <SectionHeader
          title="Recent sessions"
          action={
            <Link
              to="/sessions"
              search={{ ...filter, page: 1, pageSize: 25 }}
              className="text-[13px] text-muted-foreground hover:text-foreground"
            >
              View all {formatCount(sessions.total)} →
            </Link>
          }
        />
        <ul className="flex flex-col">
          {sessions.sessions.map((session) => (
            <li
              key={`${session.agent}:${session.sessionId}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b py-2.5 text-sm last:border-b-0"
            >
              <span className="font-medium">{AGENTS[session.agent].label}</span>
              <span className="truncate text-muted-foreground">
                {session.project ?? "no project"}
              </span>
              <span className="ms-auto font-mono text-[13px] tabular-nums">
                {formatTokens(session.tokens.total)}
              </span>
              <span className="w-16 text-right font-mono text-[13px] text-muted-foreground tabular-nums">
                {formatRelative(session.lastTimestamp)}
              </span>
            </li>
          ))}
          {sessions.sessions.length === 0 ? (
            <li className="py-2 text-sm text-muted-foreground">
              No sessions in range
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  )
}

function Kpi({
  label,
  value,
  note,
  className,
}: {
  label: string
  value: string
  note?: string
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-1 pr-4 ${className ?? ""}`}>
      <p className="truncate text-[13px] text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  )
}

function TopList({
  title,
  rows,
  to,
  filter,
}: {
  title: string
  rows: BreakdownRow[]
  to: "/agents" | "/models"
  filter: StatsFilter
}) {
  const top = rows
    .slice()
    .sort((a, b) => b.tokens.total - a.tokens.total)
    .slice(0, 5)
  return (
    <section className="min-w-0">
      <SectionHeader
        title={title}
        action={
          <Link
            to={to}
            search={filter}
            className="text-[13px] text-muted-foreground hover:text-foreground"
          >
            View all →
          </Link>
        }
      />
      <ul className="flex flex-col gap-3">
        {top.map((row) => (
          <li key={row.key} className="flex items-center gap-3 text-sm">
            <span className="w-28 truncate sm:w-40" title={row.label}>
              {row.label}
            </span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-chart-1"
                style={{ width: `${Math.max(row.tokenShare * 100, 1)}%` }}
              />
            </div>
            <span className="w-16 text-right font-mono text-[13px] tabular-nums">
              {formatTokens(row.tokens.total)}
            </span>
          </li>
        ))}
        {top.length === 0 ? (
          <li className="text-sm text-muted-foreground">No data in range</li>
        ) : null}
      </ul>
    </section>
  )
}
