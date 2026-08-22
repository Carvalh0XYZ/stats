import type {
  BreakdownRow,
  OverviewStats,
  StatsFilter,
  TimeRange,
  TimeSeries,
} from "@/lib/api/types"
import {
  formatCount,
  formatShare,
  formatTokens,
} from "@/components/data/format"

const CARD_WIDTH = 1200
const CARD_HEIGHT = 675
const BIN_COUNT = 12

const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
})

const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
})

const PERIODS: Record<TimeRange, { label: string; caption: string }> = {
  "24h": { label: "LAST 24 HOURS", caption: "the last 24 hours" },
  "7d": { label: "LAST 7 DAYS", caption: "the last 7 days" },
  "30d": { label: "LAST 30 DAYS", caption: "the last 30 days" },
  "90d": { label: "LAST 90 DAYS", caption: "the last 90 days" },
  year: { label: "LAST YEAR", caption: "the last year" },
  all: { label: "ALL TIME", caption: "my all-time view" },
}

type TwelveTokenBins = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

export type UsageShareScope = { kind: "all" } | { kind: "filtered" }

export type UsageShareComparison =
  { kind: "percent"; value: number } | { kind: "unavailable" }

export type UsageShareDisclosure = "estimated-tokens" | "unpriced-events"

export interface UsageShareModel {
  label: string
  share: number
}

export interface UsageShareSnapshot {
  period: {
    label: string
    caption: string
    startLabel: string
    endLabel: string
  }
  scope: UsageShareScope
  totalTokens: number
  comparison: UsageShareComparison
  tokenBins: TwelveTokenBins
  models: readonly UsageShareModel[]
  stats: {
    sessions: number
    activeDays: number
    pricedCostUsd: number
    outputTokens: number
  }
  disclosures: readonly UsageShareDisclosure[]
}

export interface UsageShareSource {
  overview: OverviewStats
  series: TimeSeries
  models: readonly BreakdownRow[]
  filter: StatsFilter
}

export interface UsageShareAsset {
  file: File
  svg: string
  caption: string
  xIntentUrl: string
  altText: string
}

export function createUsageShareSnapshot(
  source: UsageShareSource
): UsageShareSnapshot {
  const { overview, series, models, filter } = source
  const period =
    filter.from || filter.to
      ? { label: "SELECTED RANGE", caption: "the selected range" }
      : PERIODS[filter.range]
  const previousTokens = overview.previous?.tokens.total
  const comparison =
    previousTokens !== undefined && previousTokens > 0
      ? percentChange(overview.tokens.total, previousTokens)
      : { kind: "unavailable" as const }
  const first = overview.firstTimestamp ?? series.points.at(0)?.t ?? null
  const last = overview.lastTimestamp ?? series.points.at(-1)?.t ?? null
  const disclosures: UsageShareDisclosure[] = []

  if (overview.hasEstimatedTokens) disclosures.push("estimated-tokens")
  if (overview.unpricedEventCount > 0) disclosures.push("unpriced-events")

  return {
    period: {
      ...period,
      startLabel:
        first === null ? "NO DATA" : dayFormat.format(first).toUpperCase(),
      endLabel:
        last === null ? "NO DATA" : dayFormat.format(last).toUpperCase(),
    },
    scope:
      filter.from ||
      filter.to ||
      filter.agents?.length ||
      filter.models?.length ||
      filter.projects?.length
        ? { kind: "filtered" }
        : { kind: "all" },
    totalTokens: overview.tokens.total,
    comparison,
    tokenBins: makeTokenBins(series),
    models: makeModelMix(models),
    stats: {
      sessions: overview.sessions,
      activeDays: overview.activeDays,
      pricedCostUsd: overview.pricedCostUsd,
      outputTokens: overview.tokens.output,
    },
    disclosures,
  }
}

export function createUsageShareCaption(snapshot: UsageShareSnapshot): string {
  return `${formatTokens(snapshot.totalTokens)} tokens across my local AI coding agents in ${snapshot.period.caption}.\n\nTrack yours: npx @telemetry-dev/stats`
}

export function createUsageShareAlt(snapshot: UsageShareSnapshot): string {
  const modelSummary = snapshot.models
    .filter((model) => model.label !== "Other")
    .map((model) => `${model.label} ${formatShare(model.share)}`)
    .join(", ")
  const mix = modelSummary ? ` Model mix: ${modelSummary}.` : ""

  return `Telemetry Stats card showing ${formatTokens(snapshot.totalTokens)} total tokens in ${snapshot.period.caption}, ${formatCount(snapshot.stats.sessions)} sessions, and ${formatCount(snapshot.stats.activeDays)} active days.${mix}`
}

export async function createUsageShareAsset(
  source: UsageShareSource
): Promise<UsageShareAsset> {
  const snapshot = createUsageShareSnapshot(source)
  const svg = renderUsageShareSvg(snapshot)
  const caption = createUsageShareCaption(snapshot)
  const file = await renderPng(svg)

  return {
    file,
    svg,
    caption,
    altText: createUsageShareAlt(snapshot),
    xIntentUrl: `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}`,
  }
}

export function renderUsageShareSvg(snapshot: UsageShareSnapshot): string {
  const comparison = renderComparison(snapshot.comparison)
  const volumeLabelY = snapshot.comparison.kind === "percent" ? 376 : 350
  const period = escapeXml(snapshot.period.label)
  const periodHeader =
    snapshot.scope.kind === "filtered"
      ? `<text x="1014" y="63" class="mono muted" font-size="20" text-anchor="end" letter-spacing=".06em">${period}</text>
    <g>
      <rect x="1032" y="37" width="124" height="34" rx="17" fill="#eef3ff"/>
      <text x="1094" y="60" class="mono" fill="#2e68d2" font-size="17" font-weight="650" text-anchor="middle" letter-spacing=".05em">FILTERED</text>
    </g>`
      : `<text x="1152" y="63" class="mono muted" font-size="20" text-anchor="end" letter-spacing=".06em">${period}</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" role="img" aria-labelledby="title description">
  <title id="title">Telemetry Stats usage card</title>
  <desc id="description">${escapeXml(createUsageShareAlt(snapshot))}</desc>
  <defs>
    <linearGradient id="bar-fill" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#7758cf"/>
      <stop offset=".55" stop-color="#2e68d2"/>
      <stop offset="1" stop-color="#6ea0ff"/>
    </linearGradient>
    <clipPath id="frame-clip">
      <rect x="1" y="1" width="1198" height="673" rx="24"/>
    </clipPath>
    <style>
      .sans { font-family: "Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .mono { font-family: "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace; }
      .ink { fill: #111111; }
      .muted { fill: #6b6f76; }
      .label { font-size: 19px; font-weight: 600; letter-spacing: .07em; }
      .number { font-variant-numeric: tabular-nums; }
    </style>
  </defs>
  <g clip-path="url(#frame-clip)">
    <rect width="1200" height="675" fill="#ffffff"/>
    <rect x="1" y="1" width="1198" height="673" rx="24" fill="none" stroke="#111111" stroke-opacity=".12" stroke-width="2"/>
    ${renderLogo()}
    <text x="90" y="64" class="sans ink" font-size="22" font-weight="650">Telemetry Stats</text>
    ${periodHeader}
    <line x1="44" y1="92" x2="1156" y2="92" stroke="#111111" stroke-opacity=".10"/>
    <line x1="760" y1="124" x2="760" y2="555" stroke="#111111" stroke-opacity=".10"/>

    <text x="48" y="148" class="mono muted label">TOTAL TOKENS</text>
    <text x="43" y="269" class="sans ink number" font-size="122" font-weight="680" letter-spacing="-.055em">${escapeXml(formatTokens(snapshot.totalTokens))}</text>
    ${comparison}

    <text x="48" y="${volumeLabelY}" class="mono muted" font-size="19" font-weight="600" letter-spacing=".07em">TOKEN VOLUME</text>
    <text x="711" y="${volumeLabelY}" class="mono muted" font-size="18" text-anchor="end" letter-spacing=".04em">12 EQUAL INTERVALS</text>
    <line x1="48" y1="505" x2="711" y2="505" stroke="#111111" stroke-opacity=".10"/>
    ${renderTokenBars(snapshot.tokenBins)}
    <text x="48" y="536" class="mono muted" font-size="19">${escapeXml(snapshot.period.startLabel)}</text>
    <text x="711" y="536" class="mono muted" font-size="19" text-anchor="end">${escapeXml(snapshot.period.endLabel)}</text>

    <text x="804" y="148" class="mono muted label">YOUR MODEL MIX</text>
    ${renderModels(snapshot.models)}

    <line x1="804" y1="364" x2="1152" y2="364" stroke="#111111" stroke-opacity=".10"/>
    <line x1="978" y1="389" x2="978" y2="530" stroke="#111111" stroke-opacity=".10"/>
    <line x1="804" y1="460" x2="1152" y2="460" stroke="#111111" stroke-opacity=".10"/>
    ${renderStats(snapshot)}

    <line x1="44" y1="574" x2="1156" y2="574" stroke="#111111" stroke-opacity=".10"/>
    <g transform="translate(44 599)">
      <rect width="440" height="48" rx="12" fill="#111111"/>
      <text x="19" y="32" class="mono" fill="#ffffff" font-size="22" font-weight="500">› npx @telemetry-dev/stats</text>
    </g>
    <text x="1156" y="630" class="mono muted" font-size="17" text-anchor="end" letter-spacing=".035em">${escapeXml(disclosureText(snapshot.disclosures))}</text>
  </g>
</svg>`
}

function percentChange(
  current: number,
  previous: number
): UsageShareComparison {
  const value = ((current - previous) / previous) * 100
  return Number.isFinite(value)
    ? { kind: "percent", value }
    : { kind: "unavailable" }
}

function makeTokenBins(series: TimeSeries): TwelveTokenBins {
  const bins = Array.from({ length: BIN_COUNT }, () => 0)
  const count = series.points.length

  for (let index = 0; index < count; index++) {
    const bin = Math.min(BIN_COUNT - 1, Math.floor((index * BIN_COUNT) / count))
    bins[bin] += series.points[index].tokens
  }

  return [
    bins[0],
    bins[1],
    bins[2],
    bins[3],
    bins[4],
    bins[5],
    bins[6],
    bins[7],
    bins[8],
    bins[9],
    bins[10],
    bins[11],
  ]
}

function makeModelMix(
  rows: readonly BreakdownRow[]
): readonly UsageShareModel[] {
  const ranked = rows
    .filter((row) => row.tokens.total > 0)
    .sort((a, b) => b.tokens.total - a.tokens.total)
  const total = ranked.reduce((sum, row) => sum + row.tokens.total, 0)
  if (total === 0) return []

  const top = ranked.slice(0, 3).map((row) => ({
    label: row.label,
    share: row.tokens.total / total,
  }))
  const shown = top.reduce((sum, model) => sum + model.share, 0)
  const other = Math.max(0, 1 - shown)

  return ranked.length > 3 ? [...top, { label: "Other", share: other }] : top
}

function renderComparison(comparison: UsageShareComparison): string {
  if (comparison.kind === "unavailable") return ""

  const rounded = Math.round(comparison.value * 10) / 10
  const label = `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`
  const positive = rounded >= 0

  return `<g transform="translate(49 291)">
      <rect width="132" height="38" rx="19" fill="${positive ? "#e6f6ef" : "#fdecec"}"/>
      <text x="66" y="25" class="sans number" fill="${positive ? "#08775b" : "#b42318"}" font-size="18" font-weight="650" text-anchor="middle">${escapeXml(label)}</text>
    </g>
    <text x="195" y="316" class="sans muted" font-size="19">vs. previous period</text>`
}

function renderTokenBars(bins: TwelveTokenBins): string {
  const max = Math.max(...bins)
  const bars = bins.map((value, index) => {
    const width = index === bins.length - 1 ? 36 : 38
    const height =
      max === 0 || value === 0
        ? 6
        : Math.max(18, Math.round((value / max) * 151))
    const x = 48 + index * 57
    const y = 505 - height
    const fill = value === 0 ? "#d8dbe0" : "url(#bar-fill)"
    const opacity = value === 0 ? ".7" : ".88"
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="${fill}" opacity="${opacity}"/>`
  })

  return `<g>${bars.join("")}</g>`
}

function renderModels(models: readonly UsageShareModel[]): string {
  if (models.length === 0) {
    return `<text x="804" y="200" class="sans muted" font-size="20">No model data</text>`
  }

  const colors = ["#2e68d2", "#7758cf", "#d14d95", "#76808f"]
  return `<g class="sans">${models
    .slice(0, 4)
    .map((model, index) => {
      const textY = 188 + index * 44
      const barY = textY + 12
      const width = Math.round(348 * Math.min(1, Math.max(0, model.share)))
      const percent = model.share * 100
      const share =
        percent > 0 && percent < 1 ? "<1%" : `${Math.round(percent)}%`
      return `<text x="804" y="${textY}" class="ink" font-size="19" font-weight="600">${escapeXml(clipModelLabel(model.label))}</text>
      <text x="1152" y="${textY}" class="ink number" font-size="18" font-weight="650" text-anchor="end">${escapeXml(share)}</text>
      <rect x="804" y="${barY}" width="348" height="7" rx="3.5" fill="#111111" fill-opacity=".07"/>
      <rect x="804" y="${barY}" width="${width}" height="7" rx="3.5" fill="${colors[index]}"/>`
    })
    .join("")}</g>`
}

function renderStats(snapshot: UsageShareSnapshot): string {
  return `<g class="sans">
      <text x="804" y="407" class="mono muted" font-size="18" font-weight="600" letter-spacing=".04em">SESSIONS</text>
      <text x="804" y="444" class="ink number" font-size="34" font-weight="650">${escapeXml(formatCount(snapshot.stats.sessions))}</text>
      <text x="1008" y="407" class="mono muted" font-size="18" font-weight="600" letter-spacing=".04em">ACTIVE DAYS</text>
      <text x="1008" y="444" class="ink number" font-size="34" font-weight="650">${escapeXml(formatCount(snapshot.stats.activeDays))}</text>
      <text x="804" y="502" class="mono muted" font-size="18" font-weight="600" letter-spacing=".04em">PRICED COST</text>
      <text x="804" y="539" class="ink number" font-size="34" font-weight="650">${escapeXml(compactUsd.format(snapshot.stats.pricedCostUsd))}</text>
      <text x="1008" y="502" class="mono muted" font-size="18" font-weight="600" letter-spacing=".04em">OUTPUT TOKENS</text>
      <text x="1008" y="539" class="ink number" font-size="34" font-weight="650">${escapeXml(formatTokens(snapshot.stats.outputTokens))}</text>
    </g>`
}

function renderLogo(): string {
  return `<g transform="translate(44 38) scale(.30)" fill="#111111" aria-hidden="true">
      <path d="M28.3 17.8C26.8 17.8 26.1 15.9 27.4 14.9C34.3 10.6 43.7 5.8 57.3 5.8C70.9 5.8 80.3 10.6 87.2 14.9C88.5 15.9 87.8 17.8 86.3 17.8Z"/>
      <path d="M19.8 22.9H94.8Q96.3 22.9 97.04 24.2Q100.1 27.95 101.76 32.5Q102.5 33.8 101 33.8H77.3C71.3 33.8 68.6 32 65.8 31C63 30 61.4 29.2 57.3 29.2C53.2 29.2 51.6 30 48.8 31C46 32 43.3 33.8 37.3 33.8H13.6Q12.1 33.8 12.84 32.5Q14.5 27.95 17.56 24.2Q18.3 22.9 19.8 22.9Z"/>
      <path d="M34.2 38.8C35.6 38.8 36.3 40.3 35.6 41.4C34.7 42.6 33.4 45.4 32.9 46.9C32.4 48.3 30.8 49.3 29.9 49.3H7.8C7 49.3 6.3 48.5 6.4 47.2C6.7 45.2 7.4 42.1 8.1 40C8.4 39.35 9.1 38.8 9.55 38.8Z"/>
      <path d="M80.4 38.8H105.05C105.75 38.8 106.2 39.35 106.5 40C107.2 42.1 107.9 45.2 108.2 47.2C108.3 48.5 107.6 49.3 106.8 49.3H84.7C83.8 49.3 82.2 48.3 81.7 46.9C81.2 45.4 79.9 42.6 79 41.4C78.3 40.3 79 38.8 80.4 38.8Z"/>
      <path d="M6.8 54.5H107.8Q109.3 54.5 109.3 56L109.3 61.9Q109.3 63.4 107.8 63.4H6.8Q5.3 63.4 5.3 61.9L5.3 56Q5.3 54.5 6.8 54.5Z"/>
      <path d="M8.3 68.3H106.3C107.5 68.3 107.97 69.36 107.6 70.5L106.25 74.7C105.88 75.84 106.25 76.1 105.05 76.1H9.55C8.35 76.1 8.72 75.84 8.35 74.7L7 70.5C6.63 69.36 7.1 68.3 8.3 68.3Z"/>
      <path d="M14 81.5H100.6C101.8 81.5 102.56 83.35 101.9 84.35L99.55 87.9C98.89 88.9 99.65 88.7 98.45 88.7H16.15C14.95 88.7 15.71 88.9 15.05 87.9L12.7 84.35C12.04 83.35 12.8 81.5 14 81.5Z"/>
      <path d="M24.2 93.5H90.4C91.6 93.5 92.27 95.83 91.35 96.6L88.7 98.8C87.78 99.57 88.9 99.3 87.7 99.3H26.9C25.7 99.3 26.82 99.57 25.9 98.8L23.25 96.6C22.33 95.83 23 93.5 24.2 93.5Z"/>
      <path d="M45.6 104.5H69C70.7 104.5 71.2 107.2 69.3 107.5C66 108.3 61.9 108.9 57.3 108.9C52.7 108.9 48.6 108.3 45.3 107.5C43.4 107.2 43.9 104.5 45.6 104.5Z"/>
    </g>`
}

function clipModelLabel(label: string): string {
  const limit = 28
  if (label.length <= limit) return label
  const side = Math.floor((limit - 1) / 2)
  return `${label.slice(0, side)}…${label.slice(-side)}`
}

function disclosureText(disclosures: readonly UsageShareDisclosure[]): string {
  const estimated = disclosures.includes("estimated-tokens")
  const unpriced = disclosures.includes("unpriced-events")
  if (estimated && unpriced)
    return "INCLUDES ESTIMATED TOKENS · SOME EVENTS UNPRICED"
  if (estimated) return "INCLUDES ESTIMATED TOKENS"
  if (unpriced) return "SOME EVENTS UNPRICED"
  return "PRIVATE BY DEFAULT"
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

async function renderPng(svg: string): Promise<File> {
  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
  )

  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error("Could not load the share image."))
      image.src = url
    })

    const canvas = document.createElement("canvas")
    canvas.width = CARD_WIDTH
    canvas.height = CARD_HEIGHT
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Could not create the share image.")
    context.drawImage(image, 0, 0, CARD_WIDTH, CARD_HEIGHT)

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result)
        else reject(new Error("Could not create the share image."))
      }, "image/png")
    })

    return new File([blob], "telemetry-stats.png", { type: "image/png" })
  } finally {
    URL.revokeObjectURL(url)
  }
}
