import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { closeDb, getDb } from "../db/client.server"
import { syncUsage } from "./sync.server"

let home: string
let dataDir: string

const HEADER = JSON.stringify({ type: "session", id: "sess-1", timestamp: "2026-08-01T10:00:00Z" })

function ompMessage(id: string, output: number, cost?: number): string {
  return JSON.stringify({
    type: "message",
    id,
    timestamp: "2026-08-01T10:05:00Z",
    message: {
      role: "assistant",
      model: "claude-sonnet-4-5",
      provider: "anthropic",
      usage: {
        input: 100,
        output,
        cacheRead: 10,
        cacheWrite: 5,
        ...(cost !== undefined ? { cost: { total: cost } } : {}),
      },
    },
  })
}

function writeOmpSession(lines: string[]): string {
  const dir = join(home, ".omp", "agent", "sessions", "--tmp--proj--")
  mkdirSync(dir, { recursive: true })
  const path = join(dir, "session-1.jsonl")
  writeFileSync(path, lines.map(line => `${line}\n`).join(""))
  return path
}

// A fresh disk cache keeps pricing hermetic: no network fetch happens and
// estimated costs are deterministic ($3/M input, $15/M output, ...).
function writePricingCache(): void {
  const raw = {
    anthropic: {
      models: {
        "claude-sonnet-4-5": {
          cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
        },
      },
    },
  }
  writeFileSync(join(dataDir, "models-dev.json"), JSON.stringify({ fetchedAt: Date.now(), raw }))
}

describe("syncUsage", () => {
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ts-home-"))
    dataDir = mkdtempSync(join(tmpdir(), "ts-data-"))
    process.env.TELEMETRY_STATS_DATA_DIR = dataDir
    process.env.HOME = home
    writePricingCache()
  })

  afterEach(() => {
    closeDb()
    rmSync(home, { recursive: true, force: true })
    rmSync(dataDir, { recursive: true, force: true })
  })

  it("imports events once, keeps reported costs, prices the rest", async () => {
    writeOmpSession([HEADER, ompMessage("m1", 50, 0.12), ompMessage("m2", 70)])
    const first = await syncUsage({ agents: ["omp"] })
    expect(first.inserted).toBe(2)

    const rows = getDb()
      .prepare("SELECT cost_usd, cost_source, output_tokens FROM usage_events ORDER BY output_tokens")
      .all() as { cost_usd: number | null; cost_source: string; output_tokens: number }[]
    expect(rows).toHaveLength(2)
    expect(rows[0].cost_source).toBe("reported")
    expect(rows[0].cost_usd).toBeCloseTo(0.12)
    // 100 in * $3/M + 70 out * $15/M + 10 cr * $0.3/M + 5 cw * $3.75/M
    expect(rows[1].cost_source).toBe("estimated")
    expect(rows[1].cost_usd).toBeCloseTo((100 * 3 + 70 * 15 + 10 * 0.3 + 5 * 3.75) / 1_000_000)

    const second = await syncUsage({ agents: ["omp"] })
    expect(second.inserted).toBe(0)
    expect(second.skipped).toBeGreaterThan(0)
  })

  it("resumes appended JSONL and defers a partial trailing line", async () => {
    const path = writeOmpSession([HEADER, ompMessage("m1", 50)])
    await syncUsage({ agents: ["omp"] })

    appendFileSync(path, `${ompMessage("m2", 60)}\n`)
    appendFileSync(path, ompMessage("m3", 70).slice(0, 40))
    const second = await syncUsage({ agents: ["omp"] })
    expect(second.inserted).toBe(1)

    appendFileSync(path, `${ompMessage("m3", 70).slice(40)}\n`)
    const third = await syncUsage({ agents: ["omp"] })
    expect(third.inserted).toBe(1)
    const count = getDb().prepare("SELECT COUNT(*) AS n FROM usage_events").get() as { n: number }
    expect(count.n).toBe(3)
  })

  it("replaces events when a file is rewritten in place", async () => {
    const path = writeOmpSession([HEADER, ompMessage("m1", 50), ompMessage("m2", 60)])
    await syncUsage({ agents: ["omp"] })

    writeFileSync(path, `${HEADER}\n${ompMessage("m9", 99)}\n`)
    await syncUsage({ agents: ["omp"] })
    const rows = getDb().prepare("SELECT output_tokens FROM usage_events").all() as {
      output_tokens: number
    }[]
    expect(rows.map(row => row.output_tokens)).toEqual([99])
  })

  it("leaves costs null and unpriced for unknown models without a catalog", async () => {
    rmSync(join(dataDir, "models-dev.json"))
    writeOmpSession([
      HEADER,
      JSON.stringify({
        type: "message",
        id: "mx",
        timestamp: "2026-08-01T10:05:00Z",
        message: {
          role: "assistant",
          model: "mystery-model",
          provider: "nowhere",
          usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 },
        },
      }),
    ])
    await syncUsage({ agents: ["omp"] })
    const row = getDb().prepare("SELECT cost_usd, cost_source FROM usage_events").get() as {
      cost_usd: number | null
      cost_source: string
    }
    expect(row.cost_source).toBe("unpriced")
    expect(row.cost_usd).toBeNull()
  })

  it("joins concurrent sync calls into one run", async () => {
    writeOmpSession([HEADER, ompMessage("m1", 50)])
    const [first, second] = await Promise.all([
      syncUsage({ agents: ["omp"] }),
      syncUsage({ agents: ["omp"] }),
    ])
    expect(first).toBe(second)
  })
})
