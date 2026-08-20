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

const context = (
  home: string,
  env: Record<string, string | undefined> = {}
): DiscoveryContext => ({ platform: "darwin", home, env, extraRoots: [] })
const parseContext = () => ({ timezone: "UTC", warn: vi.fn() })

function jsonl(lines: unknown[]): string {
  return `${lines
    .map((line) => (typeof line === "string" ? line : JSON.stringify(line)))
    .join("\n")}\n`
}

async function fixture(path: string, lines: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, jsonl(lines))
}

async function sources(
  adapter: AgentAdapter,
  home: string,
  env: Record<string, string | undefined> = {}
): Promise<UsageSource[]> {
  const found = []
  for await (const source of adapter.discover(context(home, env)))
    found.push(source)
  return found
}

describe("Claude-style adapters", () => {
  test("parses exact usage and does not retain transcript text", async () => {
    const home = await mkdtemp(join(tmpdir(), "stats-claude-"))
    const path = join(home, ".claude", "projects", "-work-app", "session.jsonl")
    await fixture(path, [
      "{bad",
      {
        type: "assistant",
        timestamp: "2026-01-02T03:04:05Z",
        requestId: "req",
        sessionId: "session",
        costUSD: 0.42,
        message: {
          id: "msg",
          model: "claude-sonnet",
          content: "secret transcript",
          usage: {
            input_tokens: 10,
            output_tokens: 4,
            cache_read_input_tokens: 3,
            cache_creation_input_tokens: 2,
          },
        },
      },
    ])
    const [source] = await sources(claudeCodeAdapter, home)
    const ctx = parseContext()
    const result = await claudeCodeAdapter.parse(source!, ctx)
    expect(result.events[0]).toMatchObject({
      tokens: {
        input: 10,
        output: 4,
        cacheRead: 3,
        cacheWrite: 2,
        reasoning: 0,
      },
      costUsd: 0.42,
      costSource: "reported",
      dedupKey: "msg:req",
    })
    expect(JSON.stringify(result.events)).not.toContain("secret transcript")
    expect(ctx.warn).toHaveBeenCalledOnce()
  })

  test("qwen discovers and parses its project log", async () => {
    const home = await mkdtemp(join(tmpdir(), "stats-qwen-"))
    const path = join(home, ".qwen", "projects", "-work-qwen", "q.jsonl")
    await fixture(path, [
      {
        type: "assistant",
        timestamp: "2026-01-02T00:00:00Z",
        message: {
          model: "qwen3",
          usage: { input_tokens: 7, output_tokens: 5 },
        },
      },
    ])
    const [source] = await sources(qwenCliAdapter, home)
    expect(
      (await qwenCliAdapter.parse(source!, parseContext())).events[0]?.tokens
    ).toEqual({
      input: 7,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
    })
  })
})

describe("Codex", () => {
  test("prefers last usage, deltas cumulative usage, and reattributes Sakana", async () => {
    const home = await mkdtemp(join(tmpdir(), "stats-codex-"))
    const codexHome = join(home, "custom")
    const path = join(codexHome, "sessions", "session.jsonl")
    const lines = [
      "{old-bad",
      {
        type: "session_meta",
        payload: { model_provider: "sakana", cwd: "/work/app" },
      },
      { type: "turn_context", payload: { model: "fugu", cwd: "/work/app" } },
      {
        type: "event_msg",
        timestamp: "2026-01-02T00:00:00Z",
        payload: {
          type: "token_count",
          info: {
            last_token_usage: {
              input_tokens: 10,
              cached_input_tokens: 2,
              output_tokens: 3,
              reasoning_output_tokens: 1,
            },
            total_token_usage: {
              input_tokens: 10,
              cached_input_tokens: 2,
              output_tokens: 3,
              reasoning_output_tokens: 1,
            },
          },
        },
      },
      {
        type: "event_msg",
        timestamp: "2026-01-02T00:01:00Z",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 18,
              cached_input_tokens: 4,
              output_tokens: 7,
              reasoning_output_tokens: 2,
            },
          },
        },
      },
      "{new-bad",
    ]
    await fixture(path, lines)
    const [source] = await sources(codexAdapter, home, {
      CODEX_HOME: codexHome,
    })
    const events = (await codexAdapter.parse(source!, parseContext())).events
    expect(events.map((event) => event.tokens)).toEqual([
      { input: 8, output: 3, cacheRead: 2, cacheWrite: 0, reasoning: 1 },
      { input: 6, output: 4, cacheRead: 2, cacheWrite: 0, reasoning: 1 },
    ])
    expect(
      events.every(
        (event) => event.agent === "sakana" && event.provider === "sakana"
      )
    ).toBe(true)
    expect(events.every((event) => event.project === "/work/app")).toBe(true)
    expect(events[0]?.dedupKey).toBe("session:8:3:2:1")

    const resumeOffset = Buffer.byteLength(jsonl(lines.slice(0, 4)))
    const resumedContext = parseContext()
    const resumed = await codexAdapter.parse(source!, {
      ...resumedContext,
      resumeOffset,
    })
    expect(resumed.events).toHaveLength(1)
    expect(resumed.events[0]).toMatchObject({
      agent: "sakana",
      provider: "sakana",
      project: "/work/app",
      tokens: {
        input: 6,
        output: 4,
        cacheRead: 2,
        cacheWrite: 0,
        reasoning: 1,
      },
    })
    expect(resumedContext.warn).toHaveBeenCalledExactlyOnceWith(
      "1 malformed JSONL record(s)"
    )
  })
})

describe("Pi family", () => {
  test.each([
    [piAdapter, ".pi", "pi"],
    [ompAdapter, ".omp", "omp"],
  ] as const)(
    "parses %s usage and reported total",
    async (adapter, folder, agent) => {
      const home = await mkdtemp(join(tmpdir(), `stats-${agent}-`))
      const path = join(
        home,
        folder,
        "agent",
        "sessions",
        "--work--app--",
        "s.jsonl"
      )
      await fixture(path, [
        { type: "session", id: "s1" },
        {
          type: "message",
          id: "m1",
          timestamp: "2026-01-02T00:00:00Z",
          message: {
            role: "assistant",
            model: "model",
            provider: "provider",
            content: "private",
            usage: {
              input: 9,
              output: 4,
              cacheRead: 2,
              cacheWrite: 1,
              cost: { total: 0.12 },
            },
          },
        },
      ])
      const [source] = await sources(adapter, home)
      const event = (await adapter.parse(source!, parseContext())).events[0]
      expect(event).toMatchObject({
        agent,
        project: "/work/app",
        tokens: {
          input: 9,
          output: 4,
          cacheRead: 2,
          cacheWrite: 1,
          reasoning: 0,
        },
        costUsd: 0.12,
        costSource: "reported",
      })
      expect(JSON.stringify(event)).not.toContain("private")
    }
  )
})
