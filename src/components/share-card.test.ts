import { describe, expect, it } from "vitest"

import type { BreakdownRow } from "@/lib/api/types"
import type { UsageShareSource } from "@/components/share-card"
import {
  createUsageShareCaption,
  createUsageShareSnapshot,
  renderUsageShareSvg,
} from "@/components/share-card"

const TOKENS = {
  input: 600,
  output: 200,
  cacheRead: 150,
  cacheWrite: 25,
  reasoning: 25,
  total: 1000,
}

const SOURCE: UsageShareSource = {
  overview: {
    tokens: TOKENS,
    pricedCostUsd: 12.5,
    reportedCostUsd: 10,
    estimatedCostUsd: 2.5,
    unpricedEventCount: 0,
    unpricedTokens: 0,
    events: 20,
    sessions: 4,
    activeDays: 3,
    activeTimeMs: 3_600_000,
    cacheReadShare: 0.15,
    hasEstimatedTokens: false,
    firstTimestamp: Date.UTC(2026, 6, 1),
    lastTimestamp: Date.UTC(2026, 6, 30),
    previous: {
      tokens: { ...TOKENS, total: 500 },
      pricedCostUsd: 6,
      sessions: 2,
      activeTimeMs: 1_800_000,
      cacheReadShare: 0.1,
    },
  },
  series: {
    bucketMs: 24 * 60 * 60 * 1000,
    points: [
      {
        t: Date.UTC(2026, 6, 1),
        tokens: 1000,
        costUsd: 12.5,
        events: 20,
        byAgent: {},
      },
    ],
  },
  models: [],
  filter: { range: "30d" },
}

function source(overrides: Partial<UsageShareSource> = {}): UsageShareSource {
  return { ...SOURCE, ...overrides }
}

function model(label: string, total: number): BreakdownRow {
  return {
    key: label,
    label,
    tokens: {
      input: total,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
      total,
    },
    pricedCostUsd: 0,
    unpricedEventCount: 0,
    events: 1,
    sessions: 1,
    firstTimestamp: Date.UTC(2026, 6, 1),
    lastTimestamp: Date.UTC(2026, 6, 30),
    tokenShare: total / 100,
    hasEstimatedTokens: false,
  }
}

describe("usage share card", () => {
  it("places short time series into twelve equal bins and handles no points", () => {
    const short = createUsageShareSnapshot(
      source({
        series: {
          bucketMs: 1,
          points: [10, 20, 30].map((tokens, index) => ({
            t: index,
            tokens,
            costUsd: 0,
            events: 1,
            byAgent: {},
          })),
        },
      })
    )
    expect(short.tokenBins).toEqual([10, 0, 0, 0, 20, 0, 0, 0, 30, 0, 0, 0])

    const empty = createUsageShareSnapshot(
      source({ series: { bucketMs: 1, points: [] } })
    )
    expect(empty.tokenBins).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it("marks private filters without printing their values", () => {
    const filtered = createUsageShareSnapshot(
      source({
        overview: { ...SOURCE.overview, previous: null },
        filter: {
          range: "30d",
          models: ["private-model"],
          projects: ["/secret/project"],
        },
      })
    )
    const svg = renderUsageShareSvg(filtered)

    expect(filtered.scope).toEqual({ kind: "filtered" })
    expect(filtered.comparison).toEqual({ kind: "unavailable" })
    expect(svg).toContain("FILTERED")
    expect(svg).not.toContain("private-model")
    expect(svg).not.toContain("/secret/project")
    expect(createUsageShareSnapshot(source()).scope).toEqual({ kind: "all" })
  })

  it("accounts for the omitted model share as Other", () => {
    const snapshot = createUsageShareSnapshot(
      source({
        models: [
          model("Model A", 40),
          model("Model B", 30),
          model("Model C", 20),
          model("Model D", 10),
        ],
      })
    )

    expect(snapshot.models.map((item) => item.label)).toEqual([
      "Model A",
      "Model B",
      "Model C",
      "Other",
    ])
    expect(snapshot.models.map((item) => item.share).slice(0, 3)).toEqual([
      0.4, 0.3, 0.2,
    ])
    expect(snapshot.models[3].share).toBeCloseTo(0.1)
    expect(
      snapshot.models.reduce((sum, item) => sum + item.share, 0)
    ).toBeCloseTo(1)
  })

  it("clips and escapes model labels before adding them to SVG", () => {
    const label = `<model>&abcdefghijklmnopqrstuvwx'"tail`
    const svg = renderUsageShareSvg(
      createUsageShareSnapshot(source({ models: [model(label, 100)] }))
    )

    expect(svg).not.toContain(label)
    expect(svg).toContain("&lt;model&gt;&amp;")
    expect(svg).toContain("&quot;")
    expect(svg).toContain("&apos;")
    expect(svg).toContain("…")
  })

  it("renders combined data disclosures and the install command", () => {
    const snapshot = createUsageShareSnapshot(
      source({
        overview: {
          ...SOURCE.overview,
          hasEstimatedTokens: true,
          unpricedEventCount: 2,
        },
      })
    )
    const svg = renderUsageShareSvg(snapshot)
    const caption = createUsageShareCaption(snapshot)

    expect(svg).toContain("INCLUDES ESTIMATED TOKENS · SOME EVENTS UNPRICED")
    expect(svg).toContain("npx @telemetry-dev/stats")
    expect(caption).toBe(
      "1,000 tokens across my local AI coding agents in the last 30 days.\n\nTrack yours: npx @telemetry-dev/stats"
    )
  })
})
