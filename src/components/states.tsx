import { AlertCircleIcon, FilterXIcon, InboxIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28 max-lg:hidden" />
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-40" />
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertCircleIcon />
      <AlertTitle>Failed to load data</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {onRetry ? (
          <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
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
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">{filtered ? <FilterXIcon /> : <InboxIcon />}</EmptyMedia>
        <EmptyTitle>
          {title ?? (filtered ? "No matching usage" : "No usage recorded yet")}
        </EmptyTitle>
        <EmptyDescription>
          {description ??
            (filtered
              ? "Nothing matches the current date range and agent filters. Widen the range or clear the agent filter."
              : "Run a sync to collect token usage from your local coding agents.")}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
