import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

/** Section title row: heading left, optional description below, optional action right. */
export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-medium">{title}</h2>
        {description ? (
          <p className="text-[13px] text-pretty text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ?? null}
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16 max-lg:hidden" />
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-40" />
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded-md border border-destructive/30 p-4"
    >
      <p className="text-sm font-medium text-destructive">
        Failed to load data
      </p>
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}

export function EmptyState({
  filtered,
  title,
  description,
}: {
  /** True when data exists but the current filters exclude all of it. */
  filtered?: boolean
  title?: string
  description?: string
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 border-t py-24 text-center">
      <p className="text-sm font-medium">
        {title ?? (filtered ? "No matching usage" : "No usage recorded yet")}
      </p>
      <p className="max-w-sm text-sm text-pretty text-muted-foreground">
        {description ??
          (filtered
            ? "Nothing matches the current date range and agent filters. Widen the range or clear the agent filter."
            : "Run a sync to collect token usage from your local coding agents.")}
      </p>
    </div>
  )
}
