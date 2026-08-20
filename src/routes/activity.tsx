import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"

import type { TimeSeries } from "@/lib/api/types"
import { getJson, parseStatsSearch, statsUrl } from "@/components/data/api"
import { usePoll } from "@/components/data/use-poll"
import { UsageChartCard } from "@/components/charts"
import type { SeriesMetric } from "@/components/charts"
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states"

export const Route = createFileRoute("/activity")({
  validateSearch: parseStatsSearch,
  component: ActivityPage,
})

const METRICS: { value: SeriesMetric; label: string }[] = [
  { value: "tokens", label: "Tokens" },
  { value: "cost", label: "Cost" },
  { value: "events", label: "Events" },
]

function ActivityPage() {
  const filter = Route.useSearch()
  const [metric, setMetric] = React.useState<SeriesMetric>("tokens")
  const poll = usePoll(
    () => getJson<TimeSeries>(statsUrl("timeseries", filter)),
    JSON.stringify(filter)
  )

  if (poll.error)
    return <ErrorState message={poll.error} onRetry={poll.refresh} />
  if (poll.loading || !poll.data) return <PageSkeleton />

  const series = poll.data
  const hasUsage = series.points.some((p) => p.events > 0)
  if (!hasUsage) {
    return (
      <EmptyState
        filtered={(filter.agents?.length ?? 0) > 0 || filter.range !== "all"}
      />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">Activity</h1>
          <p className="text-[13px] text-muted-foreground">
            {metric === "tokens"
              ? "Tokens per bucket over the selected range"
              : metric === "cost"
                ? "Priced cost per bucket"
                : "Usage events per bucket"}
          </p>
        </div>
        <div
          role="group"
          aria-label="Chart metric"
          className="flex rounded-md border p-0.5"
        >
          {METRICS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={metric === item.value}
              onClick={() => setMetric(item.value)}
              className={`min-h-10 rounded-[calc(var(--radius)-2px)] px-2.5 text-[13px] focus-visible:ring-2 focus-visible:ring-ring md:min-h-7 ${
                metric === item.value
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <UsageChartCard series={series} metric={metric} />
    </div>
  )
}
