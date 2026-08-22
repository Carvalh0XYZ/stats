import * as React from "react"
import {
  RiDownloadLine,
  RiShareForward2Line,
  RiTwitterXLine,
} from "@remixicon/react"

import type { UsageShareAsset, UsageShareSource } from "@/components/share-card"
import { createUsageShareAsset } from "@/components/share-card"
import { Button } from "@/components/ui/button"
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
  | { kind: "rendering" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; asset: UsageShareAsset; actionError?: string }

export function UsageShareSheet({ source }: { source: UsageShareSource }) {
  const [open, setOpen] = React.useState(false)
  const [state, setState] = React.useState<UsageShareState>({ kind: "idle" })
  const request = React.useRef(0)

  const prepare = () => {
    const id = ++request.current
    setState({ kind: "rendering" })
    void createUsageShareAsset(source).then(
      (asset) => {
        if (request.current === id) {
          setState({ kind: "ready", asset })
        }
      },
      () => {
        if (request.current === id) {
          setState({
            kind: "failed",
            message: "Could not prepare the image. Try again.",
          })
        }
      }
    )
  }

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (next) prepare()
    else {
      request.current++
      setState({ kind: "idle" })
    }
  }

  const canShare =
    state.kind === "ready" &&
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    navigator.canShare({ files: [state.asset.file] })

  const share = async () => {
    if (state.kind !== "ready") return

    try {
      await navigator.share({
        files: [state.asset.file],
        text: state.asset.caption,
      })
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return
      setState((current) =>
        current.kind === "ready"
          ? {
              ...current,
              actionError:
                "Could not open the share sheet. Try downloading instead.",
            }
          : current
      )
    }
  }

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
          <Button variant="outline" size="sm" className="min-h-10 md:min-h-7" />
        }
      >
        <RiShareForward2Line aria-hidden />
        Share stats
      </SheetTrigger>
      <SheetContent className="overflow-y-auto data-[side=right]:w-full sm:data-[side=right]:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Share your stats</SheetTitle>
          <SheetDescription>
            Preview your usage card. Project names, session names, and filter
            values are never included.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4">
          <div className="aspect-video overflow-hidden rounded-xl border bg-muted">
            {state.kind === "ready" ? (
              <img
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(state.asset.svg)}`}
                alt={state.asset.altText}
                className="h-full w-full object-contain"
              />
            ) : state.kind === "failed" ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm text-destructive" role="alert">
                  {state.message}
                </p>
                <Button variant="outline" onClick={prepare}>
                  Try again
                </Button>
              </div>
            ) : (
              <div
                className="flex h-full animate-pulse items-center justify-center"
                role="status"
              >
                <span className="text-sm text-muted-foreground">
                  Preparing image…
                </span>
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="border-t">
          {state.kind === "ready" ? (
            <>
              <Button
                className="w-full"
                onClick={download}
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
              {canShare ? (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => void share()}
                >
                  <RiShareForward2Line aria-hidden />
                  Share image
                </Button>
              ) : null}
              <Button className="w-full" variant="outline" onClick={download}>
                <RiDownloadLine aria-hidden />
                Download image
              </Button>
              <p className="text-xs text-pretty text-muted-foreground">
                {canShare
                  ? "Post on X opens with your caption and downloads the image to attach. Share image can attach it directly."
                  : "Post on X opens with your caption and downloads the image to attach."}
              </p>
            </>
          ) : state.kind === "failed" ? null : (
            <Button className="w-full" disabled>
              Preparing image…
            </Button>
          )}
          {state.kind === "ready" && state.actionError ? (
            <p className="text-xs text-destructive" role="alert">
              {state.actionError}
            </p>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
