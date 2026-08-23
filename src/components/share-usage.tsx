import * as React from "react"
import {
  RiDownloadLine,
  RiShareForward2Line,
  RiTwitterXLine,
} from "@remixicon/react"

import type {
  BreakdownRow,
  OverviewStats,
  StatsFilter,
  TimeSeries,
} from "@/lib/api/types"
import type { UsageShareAsset } from "@/components/share-card"
import { createUsageShareAsset } from "@/components/share-card"
import { getJson, statsUrl } from "@/components/data/api"
import { usePollRefresh } from "@/components/data/use-poll"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

type UsageShareState =
  | { kind: "idle" }
  | { kind: "rendering"; filterKey: string }
  | { kind: "failed"; filterKey: string; message: string }
  | { kind: "ready"; filterKey: string; asset: UsageShareAsset }

/**
 * Fetches a share snapshot when the sheet opens, its filter changes, or a
 * sync finishes.
 */
export function UsageShareSheet({ filter }: { filter: StatsFilter }) {
  const filterKey = JSON.stringify(filter)
  const [open, setOpen] = React.useState(false)
  const [result, setResult] = React.useState<UsageShareState>({ kind: "idle" })
  const request = React.useRef(0)
  const filterRef = React.useRef(filter)
  filterRef.current = filter

  const prepare = React.useCallback(() => {
    const nextFilter = filterRef.current
    const nextFilterKey = JSON.stringify(nextFilter)
    const id = ++request.current
    setResult({ kind: "rendering", filterKey: nextFilterKey })
    const load = async () => {
      const [overview, series, models] = await Promise.all([
        getJson<OverviewStats>(statsUrl("overview", nextFilter)),
        getJson<TimeSeries>(statsUrl("timeseries", nextFilter)),
        (nextFilter.models?.length ?? 0) > 0
          ? []
          : getJson<BreakdownRow[]>(
              statsUrl("breakdown", nextFilter, { dimension: "model" })
            ),
      ])
      return createUsageShareAsset({
        overview,
        series,
        models,
        filter: nextFilter,
      })
    }
    void load().then(
      (asset) => {
        if (request.current === id) {
          setResult({ kind: "ready", filterKey: nextFilterKey, asset })
        }
      },
      () => {
        if (request.current === id) {
          setResult({
            kind: "failed",
            filterKey: nextFilterKey,
            message: "Could not prepare the image. Try again.",
          })
        }
      }
    )
  }, [])
  usePollRefresh(prepare, open)

  React.useEffect(() => {
    if (open) prepare()
  }, [filterKey, open, prepare])

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next) {
      request.current++
      setResult({ kind: "idle" })
    }
  }

  const state: UsageShareState =
    result.kind === "idle" || result.filterKey === filterKey
      ? result
      : { kind: "rendering", filterKey }

  const download = () => {
    if (state.kind !== "ready") return

    const url = URL.createObjectURL(state.asset.file)
    const link = document.createElement("a")
    link.href = url
    link.download = state.asset.file.name
    link.hidden = true
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger
        render={
          <Button
            size="sm"
            // Stretches to the toolbar row so it matches the date range
            // group's outer height; min-h keeps the mobile tap target. The
            // solid primary fill marks this as the page's key action.
            className="h-auto min-h-11 self-stretch px-3 md:min-h-7"
          />
        }
      >
        <RiShareForward2Line aria-hidden />
        Share stats
      </SheetTrigger>
      <SheetContent className="overflow-y-auto data-[side=right]:w-full sm:data-[side=right]:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Share your stats</SheetTitle>
          <SheetDescription>
            Your usage for this period, rendered as an image. Project names,
            session names, and filter values are never included.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          {state.kind === "ready" ? (
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(state.asset.svg)}`}
              alt={state.asset.altText}
              className="w-full"
            />
          ) : state.kind === "failed" ? (
            <div
              role="alert"
              className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border border-destructive/30 p-6 text-center"
            >
              <p className="text-sm font-medium text-destructive">
                Failed to render image
              </p>
              <p className="text-sm text-muted-foreground">{state.message}</p>
              <Button
                className="min-h-11 md:min-h-7"
                variant="outline"
                size="sm"
                onClick={prepare}
              >
                Retry
              </Button>
            </div>
          ) : (
            <Skeleton className="aspect-video w-full rounded-xl" />
          )}

          {state.kind === "ready" ? (
            <div className="rounded-xl bg-muted/50 p-4">
              <p className="text-[13px] text-muted-foreground">Caption</p>
              <p className="mt-1 text-sm whitespace-pre-wrap">
                {state.asset.caption}
              </p>
            </div>
          ) : state.kind === "failed" ? null : (
            <Skeleton className="h-24 rounded-xl" />
          )}
        </div>

        {state.kind === "failed" ? null : (
          <SheetFooter className="border-t">
            <div className="flex flex-col gap-2 sm:flex-row">
              {state.kind === "ready" ? (
                <>
                  <Button
                    className="min-h-11 w-full sm:flex-1 md:min-h-8"
                    onClick={download}
                    nativeButton={false}
                    render={
                      <a
                        href={state.asset.xIntentUrl}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                  >
                    <RiTwitterXLine aria-hidden />
                    Post on X
                  </Button>
                  <Button
                    className="min-h-11 w-full sm:flex-1 md:min-h-8"
                    variant="outline"
                    onClick={download}
                  >
                    <RiDownloadLine aria-hidden />
                    Download image
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    className="min-h-11 w-full sm:flex-1 md:min-h-8"
                    disabled
                  >
                    <RiTwitterXLine aria-hidden />
                    Post on X
                  </Button>
                  <Button
                    className="min-h-11 w-full sm:flex-1 md:min-h-8"
                    variant="outline"
                    disabled
                  >
                    <RiDownloadLine aria-hidden />
                    Download image
                  </Button>
                </>
              )}
            </div>
            <p className="text-xs text-pretty text-muted-foreground">
              Posting opens your X draft with the caption and downloads the
              image so you can attach it.
            </p>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
