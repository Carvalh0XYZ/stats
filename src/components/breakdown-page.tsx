import type {
  BreakdownDimension,
  BreakdownRow,
  StatsFilter,
} from "@/lib/api/types"
import { getJson, statsUrl } from "@/components/data/api"
import { usePoll } from "@/components/data/use-poll"
import { BreakdownTable } from "@/components/breakdown-table"
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states"

export function BreakdownPage({
  filter,
  dimension,
  title,
  nameLabel,
}: {
  filter: StatsFilter
  dimension: BreakdownDimension
  title: string
  nameLabel: string
}) {
  const poll = usePoll(
    () => getJson<BreakdownRow[]>(statsUrl("breakdown", filter, { dimension })),
    `${dimension}:${JSON.stringify(filter)}`
  )

  if (poll.error)
    return <ErrorState message={poll.error} onRetry={poll.refresh} />
  if (poll.loading || !poll.data) return <PageSkeleton />

  if (poll.data.length === 0) {
    return (
      <EmptyState
        filtered={(filter.agents?.length ?? 0) > 0 || filter.range !== "all"}
      />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-[13px] text-muted-foreground">
          Token usage by {dimension} in the selected range
        </p>
      </div>
      <BreakdownTable rows={poll.data} nameLabel={nameLabel} />
    </div>
  )
}
