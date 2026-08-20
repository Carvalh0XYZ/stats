import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { findRates, loadCatalog, priceTokens } from "./models-dev"

let cacheDir: string

const RAW = {
  anthropic: {
    models: {
      "claude-sonnet-4-5": { cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 } },
      "shared-model": { cost: { input: 1, output: 2 } },
    },
  },
  openrouter: {
    models: {
      "shared-model": { cost: { input: 9, output: 9 } },
      "free-model": {},
    },
  },
  "agg-one": { models: { "openai/legacy-codex": { cost: { input: 1.25, output: 10, cache_read: 0.125 } } } },
  "agg-two": { models: { "openai/legacy-codex": { cost: { input: 1.25, output: 10, cache_read: 0.125 } } } },
  "agg-three": { models: { "legacy-codex": { cost: { input: 9, output: 9 } } } },
  "agg-four": { models: { "legacy-codex": { cost: { input: 7, output: 7 } } } },
}

function writeCache(fetchedAt: number): void {
  writeFileSync(join(cacheDir, "models-dev.json"), JSON.stringify({ fetchedAt, raw: RAW }))
}

describe("models.dev pricing", () => {
  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "ts-pricing-"))
  })

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  it("uses a fresh cache without any network fetch", async () => {
    writeCache(Date.now())
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const catalog = await loadCatalog(cacheDir)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(findRates(catalog!, "anthropic", "claude-sonnet-4-5")?.input).toBe(3)
  })

  it("falls back to a stale cache when refresh fails", async () => {
    writeCache(Date.now() - 2 * 60 * 60 * 1000)
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    const catalog = await loadCatalog(cacheDir)
    expect(catalog).not.toBeNull()
    expect(findRates(catalog!, "anthropic", "claude-sonnet-4-5")?.output).toBe(15)
  })

  it("returns null with no cache and no network", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    expect(await loadCatalog(cacheDir)).toBeNull()
  })

  it("resolves exact provider+model, refuses ambiguous model-only lookups", async () => {
    writeCache(Date.now())
    const catalog = (await loadCatalog(cacheDir))!
    // Exact provider match wins even for a model defined by two providers.
    expect(findRates(catalog, "openrouter", "shared-model")?.input).toBe(9)
    // Model-only lookup with two definitions is ambiguous → no estimate.
    expect(findRates(catalog, null, "shared-model")).toBeNull()
    // Model-only lookup with a single definition resolves.
    expect(findRates(catalog, null, "claude-sonnet-4-5")?.input).toBe(3)
    // Unknown model resolves to nothing.
    expect(findRates(catalog, "anthropic", "never-heard-of-it")).toBeNull()
  })

  it("falls back to the cross-provider consensus for delisted models", async () => {
    writeCache(Date.now())
    const catalog = (await loadCatalog(cacheDir))!
    // "legacy-codex" has no exact or unambiguous entry, but the plurality of
    // rows sharing the trailing segment agree on one rate tuple.
    expect(findRates(catalog, "openai", "legacy-codex")).toMatchObject({ input: 1.25, output: 10, cacheRead: 0.125 })
    // A 1:1 rate split (see "shared-model") stays unpriced — covered above.
  })

  it("prices per million tokens across all buckets", async () => {
    writeCache(Date.now())
    const catalog = (await loadCatalog(cacheDir))!
    const rates = findRates(catalog, "anthropic", "claude-sonnet-4-5")!
    const cost = priceTokens(rates, {
      input: 1_000_000,
      output: 200_000,
      cacheRead: 500_000,
      cacheWrite: 100_000,
      reasoning: 0,
    })
    // 1M*3 + 0.2M*15 + 0.5M*0.3 + 0.1M*3.75 (per-million rates)
    expect(cost).toBeCloseTo(3 + 3 + 0.15 + 0.375)
  })
})
