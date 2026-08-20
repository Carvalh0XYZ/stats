import { promises as fs } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import type { TokenBreakdown } from "../usage/types"

const CATALOG_URL = "https://models.dev/api.json"
const CACHE_TTL_MS = 60 * 60 * 1000

const modelCostSchema = z.object({
  input: z.number().optional(),
  output: z.number().optional(),
  cache_read: z.number().optional(),
  cache_write: z.number().optional(),
  reasoning: z.number().optional(),
})

const catalogSchema = z.record(
  z.string(),
  z.object({
    models: z.record(z.string(), z.object({ cost: modelCostSchema.optional() })),
  }),
)

/** USD per one million tokens for each token bucket. */
export interface ModelRates {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
}

export interface PricingCatalog {
  /** "provider\u0000model" → rates */
  byProviderModel: Map<string, ModelRates>
  /** model → rates, only when exactly one provider defines that model id */
  byModel: Map<string, ModelRates>
  /**
   * Trailing model-id segment → consensus rates. Aggregators republish
   * first-party models as "vendor/model" ids; when one rate tuple is the
   * strict plurality across every row sharing the segment, that consensus
   * prices models the first-party provider no longer lists.
   */
  byModelPart: Map<string, ModelRates>
  fetchedAt: number
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase()
}

function parseCatalog(raw: unknown, fetchedAt: number): PricingCatalog | null {
  const parsed = catalogSchema.safeParse(raw)
  if (!parsed.success) return null
  const byProviderModel = new Map<string, ModelRates>()
  const modelCounts = new Map<string, ModelRates | null>()
  const partVotes = new Map<string, Map<string, { rates: ModelRates; count: number }>>()
  for (const [provider, entry] of Object.entries(parsed.data)) {
    for (const [model, definition] of Object.entries(entry.models)) {
      const cost = definition.cost
      if (!cost || (cost.input === undefined && cost.output === undefined)) continue
      const rates: ModelRates = {
        input: cost.input ?? 0,
        output: cost.output ?? 0,
        cacheRead: cost.cache_read ?? 0,
        cacheWrite: cost.cache_write ?? 0,
        reasoning: cost.reasoning ?? cost.output ?? 0,
      }
      byProviderModel.set(`${normalizeKey(provider)}\u0000${normalizeKey(model)}`, rates)
      const key = normalizeKey(model)
      // null marks a model id defined by several providers → ambiguous.
      modelCounts.set(key, modelCounts.has(key) ? null : rates)
      const part = key.split("/").at(-1)!
      const votes = partVotes.get(part) ?? new Map<string, { rates: ModelRates; count: number }>()
      partVotes.set(part, votes)
      const ballot = [rates.input, rates.output, rates.cacheRead, rates.cacheWrite, rates.reasoning]
        .map((value) => value.toFixed(9))
        .join(":")
      const vote = votes.get(ballot)
      if (vote) vote.count++
      else votes.set(ballot, { rates, count: 1 })
    }
  }
  const byModel = new Map<string, ModelRates>()
  for (const [model, rates] of modelCounts) {
    if (rates) byModel.set(model, rates)
  }
  const byModelPart = new Map<string, ModelRates>()
  for (const [part, votes] of partVotes) {
    const ranked = [...votes.values()].sort((a, b) => b.count - a.count)
    // Only a strict plurality is a consensus; a tie stays unpriced.
    if (ranked[0] && (ranked.length === 1 || ranked[0].count > ranked[1].count)) {
      byModelPart.set(part, ranked[0].rates)
    }
  }
  return { byProviderModel, byModel, byModelPart, fetchedAt }
}

/**
 * Load the models.dev catalog: fresh disk cache first, then network, then
 * stale disk cache. Returns null when neither is available.
 */
export async function loadCatalog(cacheDir: string): Promise<PricingCatalog | null> {
  const cachePath = join(cacheDir, "models-dev.json")
  const cached = await readCache(cachePath)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached

  try {
    const response = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(10_000) })
    if (response.ok) {
      const raw = await response.json()
      const fetchedAt = Date.now()
      const catalog = parseCatalog(raw, fetchedAt)
      if (catalog) {
        await fs.mkdir(cacheDir, { recursive: true })
        await fs.writeFile(cachePath, JSON.stringify({ fetchedAt, raw }))
        return catalog
      }
    }
  } catch {
    // Network failure falls through to the stale cache.
  }
  return cached
}

async function readCache(cachePath: string): Promise<PricingCatalog | null> {
  try {
    const stored = JSON.parse(await fs.readFile(cachePath, "utf8")) as {
      fetchedAt: number
      raw: unknown
    }
    return parseCatalog(stored.raw, stored.fetchedAt)
  } catch {
    return null
  }
}

/**
 * Exact provider+model lookup, then unambiguous model-only lookup, then the
 * cross-provider consensus for the model id's trailing segment.
 */
export function findRates(
  catalog: PricingCatalog,
  provider: string | null,
  model: string | null,
): ModelRates | null {
  if (!model) return null
  const modelKey = normalizeKey(model)
  if (provider) {
    const exact = catalog.byProviderModel.get(`${normalizeKey(provider)}\u0000${modelKey}`)
    if (exact) return exact
  }
  return (
    catalog.byModel.get(modelKey) ??
    catalog.byModelPart.get(modelKey.split("/").at(-1)!) ??
    null
  )
}

export function priceTokens(rates: ModelRates, tokens: TokenBreakdown): number {
  return (
    (tokens.input * rates.input +
      tokens.output * rates.output +
      tokens.cacheRead * rates.cacheRead +
      tokens.cacheWrite * rates.cacheWrite +
      tokens.reasoning * rates.reasoning) /
    1_000_000
  )
}
