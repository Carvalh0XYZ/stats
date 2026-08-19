import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"

import type { TimeSeries } from "@/lib/api/types"
import { getJson, parseStatsSearch, statsUrl } from "@/components/data/api"
import { usePoll } from "@/components/data/use-poll"
import { UsageAreaChart, type SeriesMetric } from "@/components/charts"
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

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

  if (poll.error) return <ErrorState message={poll.error} onRetry={poll.refresh} />
  if (poll.loading || !poll.data) return <PageSkeleton />

  const series = poll.data
  const hasUsage = series.points.some((p) => p.events > 0)
  if (!hasUsage) {
    return <EmptyState filtered={(filter.agents?.length ?? 0) > 0 || filter.range !== "all"} />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>
          {metric === "tokens"
            ? "Tokens per bucket, stacked by agent"
            : metric === "cost"
              ? "Priced cost per bucket"
              : "Usage events per bucket"}
        </CardDescription>
        <CardAction>
          <ToggleGroup
            value={[metric]}
            onValueChange={(value: unknown[]) => {
              const next = value[0]
              if (typeof next === "string") setMetric(next as SeriesMetric)
            }}
            variant="outline"
            spacing={0}
            aria-label="Chart metric"
          >
            {METRICS.map((item) => (
              <ToggleGroupItem
                key={item.value}
                value={item.value}
                className="min-h-11 md:min-h-8"
              >
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent>
        <UsageAreaChart series={series} metric={metric} />
      </CardContent>
    </Card>
  )
}
