// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { OverviewStats } from "@/lib/api/types"
import type { UsageShareSource } from "@/components/share-card"
import { refreshPolls } from "@/components/data/use-poll"
import { UsageShareSheet } from "@/components/share-usage"

vi.mock("@/components/share-card", () => ({
  createUsageShareAsset: vi.fn(async (source: UsageShareSource) => {
    const total = source.overview.tokens.total
    return {
      file: new File([], "stats.png", { type: "image/png" }),
      svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      caption: `${total} tokens`,
      xIntentUrl: "https://twitter.com/intent/tweet",
      altText: `${total} tokens`,
    }
  }),
}))

const tokens = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  reasoning: 0,
  total: 0,
}

function overview(total: number): OverviewStats {
  return {
    tokens: { ...tokens, total },
    pricedCostUsd: 0,
    reportedCostUsd: 0,
    estimatedCostUsd: 0,
    unpricedEventCount: 0,
    unpricedTokens: 0,
    events: 0,
    sessions: 0,
    activeDays: 0,
    activeTimeMs: 0,
    cacheReadShare: 0,
    hasEstimatedTokens: false,
    firstTimestamp: null,
    lastTimestamp: null,
    previous: null,
  }
}

describe("UsageShareSheet", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("refreshes an open preview when the page polls refresh", async () => {
    let total = 1
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input)
        const body = path.startsWith("/api/overview")
          ? overview(total)
          : path.startsWith("/api/timeseries")
            ? { bucketMs: 1, points: [] }
            : []
        return Response.json(body)
      })
    )

    render(<UsageShareSheet filter={{ range: "30d" }} />)
    fireEvent.click(screen.getByRole("button", { name: "Share stats" }))

    expect(await screen.findByText("1 tokens")).toBeTruthy()

    total = 2
    act(() => refreshPolls())

    expect(await screen.findByText("2 tokens")).toBeTruthy()
  })
})
