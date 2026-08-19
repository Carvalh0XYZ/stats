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
import { ActivityCalendar, TokenMixBar, UsageAreaChart } from "@/components/charts"
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

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
    const [overview, series, yearSeries, agents, models, sessions] = await Promise.all([
      getJson<OverviewStats>(statsUrl("overview", filter)),
      getJson<TimeSeries>(statsUrl("timeseries", filter)),
      getJson<TimeSeries>(statsUrl("timeseries", yearFilter)),
      getJson<BreakdownRow[]>(statsUrl("breakdown", filter, { dimension: "agent" })),
      getJson<BreakdownRow[]>(statsUrl("breakdown", filter, { dimension: "model" })),
      getJson<SessionPage>(statsUrl("sessions", filter, { page: "1", pageSize: "5" })),
    ])
    return { overview, series, yearSeries, agents, models, sessions }
  }, JSON.stringify(filter))

  if (poll.error) return <ErrorState message={poll.error} onRetry={poll.refresh} />
  if (poll.loading || !poll.data) return <PageSkeleton />

  const { overview, series, yearSeries, agents, models, sessions } = poll.data
  const filtered = (filter.agents?.length ?? 0) > 0 || filter.range !== "all"
  if (overview.events === 0) return <EmptyState filtered={filtered} />

  const estimated = overview.hasEstimatedTokens

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Total tokens"
          value={formatTokens(overview.tokens.total)}
          note={estimated ? "includes estimated" : undefined}
        />
        <Kpi
          label="Priced cost"
          value={formatCost(overview.pricedCostUsd)}
          note={
            overview.unpricedEventCount > 0
              ? `+${formatCount(overview.unpricedEventCount)} unpriced`
              : undefined
          }
        />
        <Kpi label="Sessions" value={formatCount(overview.sessions)} />
        <Kpi
          label="Active time"
          value={formatDuration(overview.activeTimeMs)}
          note={`${formatCount(overview.activeDays)} active days`}
        />
        <Kpi label="Cache read share" value={formatShare(overview.cacheReadShare)} />
        <Kpi label="Output tokens" value={formatTokens(overview.tokens.output)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Token usage</CardTitle>
          <CardDescription>Stacked by agent over the selected range</CardDescription>
        </CardHeader>
        <CardContent>
          <UsageAreaChart series={series} metric="tokens" />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily activity</CardTitle>
            <CardDescription>Tokens per day, last year</CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityCalendar series={yearSeries} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Token mix</CardTitle>
            <CardDescription>
              Input, output, cache, and reasoning tokens
              {estimated ? " (some values estimated)" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TokenMixBar tokens={overview.tokens} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TopList title="Top agents" rows={agents} to="/agents" filter={filter} />
        <TopList title="Top models" rows={models} to="/models" filter={filter} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent sessions</CardTitle>
          <CardDescription>
            <Link
              to="/sessions"
              search={{ ...filter, page: 1, pageSize: 25 }}
              className="underline underline-offset-4"
            >
              View all {formatCount(sessions.total)} sessions
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y">
            {sessions.sessions.map((session) => (
              <li
                key={`${session.agent}:${session.sessionId}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
              >
                <Badge variant="secondary">{AGENTS[session.agent].label}</Badge>
                <span className="truncate text-muted-foreground">
                  {session.project ?? "no project"}
                </span>
                <span className="ms-auto tabular-nums">
                  {formatTokens(session.tokens.total)} tokens
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {formatRelative(session.lastTimestamp)}
                </span>
              </li>
            ))}
            {sessions.sessions.length === 0 ? (
              <li className="py-2 text-sm text-muted-foreground">No sessions in range</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {note ? (
        <CardContent>
          <p className="text-xs text-muted-foreground">{note}</p>
        </CardContent>
      ) : null}
    </Card>
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
  const top = rows.slice().sort((a, b) => b.tokens.total - a.tokens.total).slice(0, 5)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          <Link to={to} search={filter} className="underline underline-offset-4">
            View all
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {top.map((row) => (
            <li key={row.key} className="flex items-center gap-3 text-sm">
              <span className="w-28 truncate sm:w-40" title={row.label}>
                {row.label}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(row.tokenShare * 100, 1)}%` }}
                />
              </div>
              <span className="w-16 text-right tabular-nums">
                {formatTokens(row.tokens.total)}
              </span>
            </li>
          ))}
          {top.length === 0 ? (
            <li className="text-sm text-muted-foreground">No data in range</li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  )
}
