import { promises as fs } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, it } from "vitest"
import type { AgentAdapter, DiscoveryContext, UsageSource } from "../types"
import { cursorAdapter } from "./cursor"
import { antigravityAdapter } from "./antigravity"
import { traeAdapter } from "./trae"
import { warpAdapter } from "./warp"
import { minimaxCodeAdapter } from "./minimax-code"

async function fixture(): Promise<{ root: string; context: DiscoveryContext }> {
  const root = await fs.mkdtemp(join(tmpdir(), "telemetry-cache-"))
  return { root, context: { platform: process.platform, home: root, env: {}, extraRoots: [] } }
}

async function sources(adapter: AgentAdapter, context: DiscoveryContext): Promise<UsageSource[]> {
  const found: UsageSource[] = []
  for await (const source of adapter.discover(context)) found.push(source)
  return found
}

describe("cache adapters", () => {
  it("parses quoted Cursor CSV rows and honors XDG_CONFIG_HOME", async () => {
    const { root, context } = await fixture()
    const config = join(root, "xdg")
    context.env.XDG_CONFIG_HOME = config
    const dir = join(config, "tokscale/cursor-cache")
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, "usage.work.csv"), 'Date,Kind,Model,Input Tokens,Output Tokens,Cache Read Tokens,Cache Write Tokens,Cost,Project,Request ID\n"2026-08-18T12:00:00Z","Agent, edit",gpt-5,10,4,3,2,"$0.25","repo, one",req-1\nmalformed\n')
    const [source] = await sources(cursorAdapter, context)
    const warnings: string[] = []
    const output = await cursorAdapter.parse(source!, { timezone: "UTC", warn: (message) => warnings.push(message) })
    expect(output.events[0]).toMatchObject({ model: "gpt-5", project: "repo, one", tokens: { input: 10, output: 4, cacheRead: 3, cacheWrite: 2, reasoning: 0 }, costUsd: 0.25, costSource: "reported", dedupKey: "req-1" })
    expect(warnings).toHaveLength(1)
  })

  it("parses Antigravity meta and usage while skipping malformed lines", async () => {
    const { root, context } = await fixture()
    const dir = join(root, ".config/tokscale/antigravity-cache/sessions")
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, "one.jsonl"), '{"type":"session_meta","modelId":"gemini-3-pro"}\nnot-json\n{"type":"usage","sessionId":"s1","timestamp":"2026-08-18T12:00:00Z","providerId":"google","input":12,"output":4,"cacheRead":2,"responseId":"r1"}\n')
    const [source] = await sources(antigravityAdapter, context)
    const warnings: string[] = []
    const output = await antigravityAdapter.parse(source!, { timezone: "UTC", warn: (message) => warnings.push(message) })
    expect(output.events[0]).toMatchObject({ model: "gemini-3-pro", tokens: { input: 12, output: 4, cacheRead: 2, cacheWrite: 0, reasoning: 0 }, dedupKey: "r1" })
    expect(warnings).toHaveLength(1)
  })

  it("keeps only the latest Trae record per session", async () => {
    const { root, context } = await fixture()
    const dir = join(root, ".config/tokscale/trae-cache/sessions")
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, "usage.json"), JSON.stringify([
      { session_id: "s1", usage_time: 1_776_000_000, model_name: "GPT-5", dollar_float: 0.1, extra_info: { input_token: 10, output_token: 1 } },
      { session_id: "s1", usage_time: 1_776_000_100, model_name: "GPT-5", dollar_float: 0.2, extra_info: { input_token: 20, output_token: 2 } },
    ]))
    const [source] = await sources(traeAdapter, context)
    const output = await traeAdapter.parse(source!, { timezone: "UTC", warn: () => {} })
    expect(output.events).toHaveLength(1)
    expect(output.events[0]).toMatchObject({ timestamp: 1_776_000_100_000, tokens: { input: 20, output: 2 }, costUsd: 0.2, dedupKey: "trae:s1" })
  })

  it("reports Warp spend with no synthetic tokens", async () => {
    const { root, context } = await fixture()
    const dir = join(root, ".config/tokscale/warp-cache")
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, "usage.json"), JSON.stringify({ syncedAt: "2026-08-18T12:00:00Z", usage: { requestsUsed: 42, spendCents: 1234 }, workspaces: [] }))
    const [source] = await sources(warpAdapter, context)
    const output = await warpAdapter.parse(source!, { timezone: "UTC", warn: () => {} })
    expect(output.events[0]).toMatchObject({ tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }, costUsd: 12.34, costSource: "reported" })
  })

  it("pairs MiniMax stream usage with its result model and honors the override", async () => {
    const { root, context } = await fixture()
    const headless = join(root, "capture")
    context.env.TOKSCALE_HEADLESS_DIR = headless
    const dir = join(headless, "mcode")
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, "run.jsonl"), '{"type":"message","message":{"turnId":"t1","role":"assistant","timestamp":1786800000000,"usage":{"inputTokens":11,"outputTokens":3,"cacheReadTokens":2}}}\n{"type":"exec.result","sessionId":"s1","turnId":"t1","model":{"providerId":"minimax","modelId":"MiniMax-M2.5"},"durationMs":10}\n')
    const [source] = await sources(minimaxCodeAdapter, context)
    const output = await minimaxCodeAdapter.parse(source!, { timezone: "UTC", warn: () => {} })
    expect(output.events[0]).toMatchObject({ provider: "minimax", model: "MiniMax-M2.5", sessionId: "s1", tokens: { input: 11, output: 3, cacheRead: 2, cacheWrite: 0, reasoning: 0 }, durationMs: 10 })
  })
})
