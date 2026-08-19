import { createFileRoute } from "@tanstack/react-router"

import { AGENTS } from "@/lib/agents/registry"
import type { SessionPage, SessionSummary, StatsFilter } from "@/lib/api/types"
import { getJson, parseStatsSearch, statsUrl } from "@/components/data/api"
import {
  formatCost,
  formatCount,
  formatDateTime,
  formatDuration,
  formatTokens,
} from "@/components/data/format"
import { usePoll } from "@/components/data/use-poll"
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type SessionsSearch = StatsFilter & { page: number; pageSize: number }

export const Route = createFileRoute("/sessions")({
  validateSearch: (input: Record<string, unknown>): SessionsSearch => {
    const page = Number(input["page"])
    const pageSize = Number(input["pageSize"])
    return {
      ...parseStatsSearch(input),
      page: Number.isInteger(page) && page > 0 ? page : 1,
      pageSize: Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 200 ? pageSize : 25,
    }
  },
  component: SessionsPage,
})

function SessionsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { page, pageSize, ...filter } = search
  const poll = usePoll(
    () =>
      getJson<SessionPage>(
        statsUrl("sessions", filter, { page: String(page), pageSize: String(pageSize) })
      ),
    JSON.stringify(search)
  )

  if (poll.error) return <ErrorState message={poll.error} onRetry={poll.refresh} />
  if (poll.loading || !poll.data) return <PageSkeleton />

  const data = poll.data
  if (data.total === 0) {
    return <EmptyState filtered={(filter.agents?.length ?? 0) > 0 || filter.range !== "all"} />
  }

  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize))
  const setPage = (next: number) => {
    void navigate({ search: { ...search, page: next } })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>
          {formatCount(data.total)} sessions in range · page {data.page} of {pageCount}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Desktop table */}
        <div className="max-md:hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Models</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sessions.map((session) => (
                <TableRow key={`${session.agent}:${session.sessionId}`}>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {formatDateTime(session.firstTimestamp)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{AGENTS[session.agent].label}</Badge>
                  </TableCell>
                  <TableCell className="max-w-48 truncate" title={session.project ?? undefined}>
                    {session.project ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="max-w-48 truncate" title={session.models.join(", ")}>
                    {session.models.join(", ") || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      {formatTokens(session.tokens.total)}
                      {session.hasEstimatedTokens ? (
                        <Badge variant="outline">estimated</Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <SessionCost session={session} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDuration(session.lastTimestamp - session.firstTimestamp)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile stacked rows */}
        <ul className="flex flex-col gap-2 md:hidden">
          {data.sessions.map((session) => (
            <li key={`${session.agent}:${session.sessionId}`} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{AGENTS[session.agent].label}</Badge>
                <span className="text-muted-foreground tabular-nums">
                  {formatDateTime(session.firstTimestamp)}
                </span>
                {session.hasEstimatedTokens ? (
                  <Badge variant="outline">estimated</Badge>
                ) : null}
              </div>
              <p className="mt-1 truncate">{session.project ?? "no project"}</p>
              <p className="truncate text-muted-foreground">
                {session.models.join(", ") || "unknown model"}
              </p>
              <div className="mt-2 flex flex-wrap justify-between gap-2 tabular-nums">
                <span>{formatTokens(session.tokens.total)} tokens</span>
                <SessionCost session={session} />
                <span>{formatDuration(session.lastTimestamp - session.firstTimestamp)}</span>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            disabled={data.page <= 1}
            onClick={() => setPage(data.page - 1)}
            className="min-h-11 md:min-h-8"
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            Page {data.page} / {pageCount}
          </span>
          <Button
            variant="outline"
            disabled={data.page >= pageCount}
            onClick={() => setPage(data.page + 1)}
            className="min-h-11 md:min-h-8"
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function SessionCost({ session }: { session: SessionSummary }) {
  if (session.pricedCostUsd === 0 && session.unpricedEventCount === session.events) {
    return <span className="text-muted-foreground">unpriced</span>
  }
  return <span>{formatCost(session.pricedCostUsd)}</span>
}
