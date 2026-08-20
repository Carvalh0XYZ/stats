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
import { Button } from "@/components/ui/button"
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
      pageSize:
        Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 200
          ? pageSize
          : 25,
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
        statsUrl("sessions", filter, {
          page: String(page),
          pageSize: String(pageSize),
        })
      ),
    JSON.stringify(search)
  )

  if (poll.error)
    return <ErrorState message={poll.error} onRetry={poll.refresh} />
  if (poll.loading || !poll.data) return <PageSkeleton />

  const data = poll.data
  if (data.total === 0) {
    return (
      <EmptyState
        filtered={(filter.agents?.length ?? 0) > 0 || filter.range !== "all"}
      />
    )
  }

  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize))
  const setPage = (next: number) => {
    void navigate({ search: { ...search, page: next } })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-xl font-semibold tracking-tight">Sessions</h1>
        <p className="text-[13px] text-muted-foreground tabular-nums">
          {formatCount(data.total)} sessions in range
        </p>
      </div>

      {/* Desktop table */}
      <div className="-mx-4 -my-2 overflow-x-auto whitespace-nowrap max-md:hidden md:-mx-6">
        <div className="inline-block min-w-full px-4 py-2 align-middle md:px-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Date</TableHead>
                <TableHead className="whitespace-nowrap">Agent</TableHead>
                <TableHead className="whitespace-nowrap">Project</TableHead>
                <TableHead className="whitespace-nowrap">Models</TableHead>
                <TableHead className="text-right whitespace-nowrap">
                  Tokens
                </TableHead>
                <TableHead className="text-right whitespace-nowrap">
                  Cost
                </TableHead>
                <TableHead className="text-right whitespace-nowrap">
                  Duration
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sessions.map((session) => (
                <TableRow key={`${session.agent}:${session.sessionId}`}>
                  <TableCell className="font-mono text-[13px] text-muted-foreground tabular-nums">
                    {formatDateTime(session.firstTimestamp)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {AGENTS[session.agent].label}
                  </TableCell>
                  <TableCell
                    className="max-w-48 truncate"
                    title={session.project ?? undefined}
                  >
                    {session.project ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell
                    className="max-w-48 truncate text-muted-foreground"
                    title={session.models.join(", ")}
                  >
                    {session.models.join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] tabular-nums">
                    {formatTokens(session.tokens.total)}
                    {session.hasEstimatedTokens ? (
                      <span
                        className="text-muted-foreground"
                        title="Includes estimated tokens"
                      >
                        {" "}
                        est.
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] tabular-nums">
                    <SessionCost session={session} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] text-muted-foreground tabular-nums">
                    {formatDuration(
                      session.lastTimestamp - session.firstTimestamp
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile stacked rows */}
      <ul className="flex flex-col md:hidden">
        {data.sessions.map((session) => (
          <li
            key={`${session.agent}:${session.sessionId}`}
            className="border-b py-3 text-sm last:border-b-0"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-medium">{AGENTS[session.agent].label}</span>
              <span className="ms-auto font-mono text-xs text-muted-foreground tabular-nums">
                {formatDateTime(session.firstTimestamp)}
              </span>
            </div>
            <p className="mt-1 truncate">{session.project ?? "no project"}</p>
            <p className="truncate text-muted-foreground">
              {session.models.join(", ") || "unknown model"}
            </p>
            <div className="mt-2 flex flex-wrap justify-between gap-2 font-mono text-[13px] tabular-nums">
              <span>
                {formatTokens(session.tokens.total)} tokens
                {session.hasEstimatedTokens ? (
                  <span className="text-muted-foreground"> est.</span>
                ) : null}
              </span>
              <SessionCost session={session} />
              <span>
                {formatDuration(session.lastTimestamp - session.firstTimestamp)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={data.page <= 1}
          onClick={() => setPage(data.page - 1)}
          className="min-h-11 md:min-h-8"
        >
          Previous
        </Button>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {data.page} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={data.page >= pageCount}
          onClick={() => setPage(data.page + 1)}
          className="min-h-11 md:min-h-8"
        >
          Next
        </Button>
      </div>
    </div>
  )
}

function SessionCost({ session }: { session: SessionSummary }) {
  if (
    session.pricedCostUsd === 0 &&
    session.unpricedEventCount === session.events
  ) {
    return <span className="text-muted-foreground">unpriced</span>
  }
  return <span>{formatCost(session.pricedCostUsd)}</span>
}
