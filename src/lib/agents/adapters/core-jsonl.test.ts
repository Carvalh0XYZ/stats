import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, test, vi } from "vitest"
import type { AgentAdapter, DiscoveryContext, UsageSource } from "../types"
import { claudeCodeAdapter } from "./claude-code"
import { codexAdapter } from "./codex"
import { piAdapter } from "./pi"
import { ompAdapter } from "./omp"
import { qwenCliAdapter } from "./qwen-cli"

const context = (home: string, env: Record<string, string | undefined> = {}): DiscoveryContext => ({ platform: "darwin", home, env, extraRoots: [] })
const parseContext = () => ({ timezone: "UTC", warn: vi.fn() })

async function fixture(path: string, lines: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${lines.map((line) => typeof line === "string" ? line : JSON.stringify(line)).join("\n")}\n`)
}

async function sources(adapter: AgentAdapter, home: string, env: Record<string, string | undefined> = {}): Promise<UsageSource[]> {
  const found = []
  for await (const source of adapter.discover(context(home, env))) found.push(source)
  return found
}

describe("Claude-style adapters", () => {
  test("parses exact usage and does not retain transcript text", async () => {
    const home = await mkdtemp(join(tmpdir(), "stats-claude-"))
    const path = join(home, ".claude", "projects", "-work-app", "session.jsonl")
    await fixture(path, [
      "{bad",
      { type: "assistant", timestamp: "2026-01-02T03:04:05Z", requestId: "req", sessionId: "session", costUSD: 0.42, message: { id: "msg", model: "claude-sonnet", content: "secret transcript", usage: { input_tokens: 10, output_tokens: 4, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 } } },
    ])
    const [source] = await sources(claudeCodeAdapter, home)
    const ctx = parseContext()
    const result = await claudeCodeAdapter.parse(source!, ctx)
    expect(result.events[0]).toMatchObject({ tokens: { input: 10, output: 4, cacheRead: 3, cacheWrite: 2, reasoning: 0 }, costUsd: 0.42, costSource: "reported", dedupKey: "msg:req" })
    expect(JSON.stringify(result.events)).not.toContain("secret transcript")
    expect(ctx.warn).toHaveBeenCalledOnce()
  })

  test("qwen discovers and parses its project log", async () => {
    const home = await mkdtemp(join(tmpdir(), "stats-qwen-"))
    const path = join(home, ".qwen", "projects", "-work-qwen", "q.jsonl")
    await fixture(path, [{ type: "assistant", timestamp: "2026-01-02T00:00:00Z", message: { model: "qwen3", usage: { input_tokens: 7, output_tokens: 5 } } }])
    const [source] = await sources(qwenCliAdapter, home)
    expect((await qwenCliAdapter.parse(source!, parseContext())).events[0]?.tokens).toEqual({ input: 7, output: 5, cacheRead: 0, cacheWrite: 0, reasoning: 0 })
  })

  test("merges streaming duplicates per-field and skips synthetic turns", async () => {
    const home = await mkdtemp(join(tmpdir(), "stats-claude-dup-"))
    const path = join(home, ".claude", "projects", "-work-app", "session.jsonl")
    const dup = (output: number) => ({ type: "assistant", timestamp: "2026-01-02T00:00:00Z", requestId: "req", sessionId: "s", message: { id: "msg", model: "claude-sonnet", usage: { input_tokens: 10, output_tokens: output } } })
    await fixture(path, [
      dup(5),
      dup(50),
      { type: "assistant", timestamp: "2026-01-02T00:00:01Z", sessionId: "s", message: { id: "syn", model: "<synthetic>", usage: {} } },
    ])
    const [source] = await sources(claudeCodeAdapter, home)
    const events = (await claudeCodeAdapter.parse(source!, parseContext())).events
    expect(events).toHaveLength(1)
    expect(events[0]?.tokens).toMatchObject({ input: 10, output: 50 })
  })
})

describe("Codex", () => {
  test("prefers last usage, deltas cumulative usage, and reattributes Sakana", async () => {
    const home = await mkdtemp(join(tmpdir(), "stats-codex-"))
    const codexHome = join(home, "custom")
    const path = join(codexHome, "sessions", "session.jsonl")
    await fixture(path, [
      { type: "session_meta", payload: { model_provider: "sakana" } },
      { type: "turn_context", payload: { model: "fugu" } },
      { type: "event_msg", timestamp: "2026-01-02T00:00:00Z", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 3, reasoning_output_tokens: 1 }, total_token_usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 3, reasoning_output_tokens: 1 } } } },
      { type: "event_msg", timestamp: "2026-01-02T00:01:00Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 18, cached_input_tokens: 4, output_tokens: 7, reasoning_output_tokens: 2 } } } },
      // Duplicate cumulative snapshot: skipped, not double counted.
      { type: "event_msg", timestamp: "2026-01-02T00:02:00Z", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 8, output_tokens: 4 }, total_token_usage: { input_tokens: 18, cached_input_tokens: 4, output_tokens: 7, reasoning_output_tokens: 2 } } } },
      // Zero-token snapshot: skipped.
      { type: "event_msg", timestamp: "2026-01-02T00:03:00Z", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 0, output_tokens: 0 }, total_token_usage: { input_tokens: 19, cached_input_tokens: 4, output_tokens: 7, reasoning_output_tokens: 2 } } } },
    ])
    const [source] = await sources(codexAdapter, home, { CODEX_HOME: codexHome })
    const events = (await codexAdapter.parse(source!, parseContext())).events
    // Cached tokens split out of input; reasoning split out of output.
    expect(events.map((event) => event.tokens)).toEqual([
      { input: 8, output: 2, cacheRead: 2, cacheWrite: 0, reasoning: 1 },
      { input: 6, output: 3, cacheRead: 2, cacheWrite: 0, reasoning: 1 },
    ])
    expect(events.every((event) => event.agent === "sakana" && event.provider === "sakana")).toBe(true)
    expect(events[0]?.dedupKey).toBe("session:sakana:fugu:10:3:2:1")
  })

  test("skips replayed parent history in forked child logs", async () => {
    const home = await mkdtemp(join(tmpdir(), "stats-codex-fork-"))
    const codexHome = join(home, "custom")
    const path = join(codexHome, "sessions", "child.jsonl")
    // UUID v7 millisecond prefixes order the child session before its own turn.
    const child = "01920000-0000-7000-8000-000000000001"
    const ownTurn = "01920000-0001-7000-8000-000000000002"
    await fixture(path, [
      { type: "session_meta", timestamp: "2026-01-02T00:00:00Z", payload: { id: child, forked_from_id: "parent-session", model_provider: "openai" } },
      { type: "session_meta", timestamp: "2026-01-02T00:00:00Z", payload: { id: "parent-session", model_provider: "openai" } },
      // Replayed parent history: model and token_count arrive before the child's own turn.
      { type: "turn_context", timestamp: "2026-01-02T00:00:00Z", payload: { turn_id: "01910000-0000-7000-8000-00000000000a", model: "gpt-old" } },
      { type: "event_msg", timestamp: "2026-01-02T00:00:01Z", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 100, output_tokens: 30 }, total_token_usage: { input_tokens: 100, output_tokens: 30, total_tokens: 130 } } } },
      // The child's own turn ends the replay skip.
      { type: "turn_context", timestamp: "2026-01-02T00:00:02Z", payload: { turn_id: ownTurn, model: "gpt-new" } },
      { type: "event_msg", timestamp: "2026-01-02T00:00:03Z", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 50, output_tokens: 10 }, total_token_usage: { input_tokens: 150, output_tokens: 40, total_tokens: 190 } } } },
    ])
    const [source] = await sources(codexAdapter, home, { CODEX_HOME: codexHome })
    const events = (await codexAdapter.parse(source!, parseContext())).events
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ model: "gpt-new", tokens: { input: 50, output: 10, cacheRead: 0, cacheWrite: 0, reasoning: 0 } })
    // Dedup keys are scoped to the fork parent so sibling replays collapse.
    expect(events[0]?.dedupKey).toBe("parent-session:openai:gpt-new:150:40:0:0")
  })
})

describe("Pi family", () => {
  test.each([[piAdapter, ".pi", "pi"], [ompAdapter, ".omp", "omp"]] as const)("parses %s usage and reported total", async (adapter, folder, agent) => {
    const home = await mkdtemp(join(tmpdir(), `stats-${agent}-`))
    const path = join(home, folder, "agent", "sessions", "--work--app--", "s.jsonl")
    await fixture(path, [
      { type: "session", id: "s1" },
      { type: "message", id: "m1", timestamp: "2026-01-02T00:00:00Z", message: { role: "assistant", model: "model", provider: "provider", content: "private", usage: { input: 9, output: 4, cacheRead: 2, cacheWrite: 1, cost: { total: 0.12 } } } },
    ])
    const [source] = await sources(adapter, home)
    const event = (await adapter.parse(source!, parseContext())).events[0]
    expect(event).toMatchObject({ agent, project: "/work/app", tokens: { input: 9, output: 4, cacheRead: 2, cacheWrite: 1, reasoning: 0 }, costUsd: 0.12, costSource: "reported" })
    expect(JSON.stringify(event)).not.toContain("private")
  })
})
