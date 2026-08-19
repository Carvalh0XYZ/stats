import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import type { AgentAdapter, DiscoveryContext, UsageSource } from "../types"
import { clineAdapter } from "./cline"
import { copilotCliAdapter } from "./copilot-cli"
import { devinDesktopAdapter } from "./devin-desktop"
import { kiloCodeAdapter, rooCodeAdapter } from "./editor-tasks"

async function found(adapter: AgentAdapter, context: DiscoveryContext): Promise<UsageSource[]> {
  const sources: UsageSource[] = []
  for await (const source of adapter.discover(context)) sources.push(source)
  return sources
}

const parseContext = { timezone: "UTC", warn: (_message: string) => {} }

describe("editor storage adapters", () => {
  it.each([
    [clineAdapter, "saoudrizwan.claude-dev"],
    [rooCodeAdapter, "rooveterinaryinc.roo-cline"],
    [kiloCodeAdapter, "kilocode.kilo-code"],
  ] as const)("counts only api request entries", async (adapter, extension) => {
    const home = await mkdtemp(join(tmpdir(), "stats-editor-"))
    const path = join(home, ".config", "Code", "User", "globalStorage", extension, "tasks", "task-1", "ui_messages.json")
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify([
      { type: "say", say: "text", ts: "2026-08-01T00:00:00Z", text: "ignored transcript" },
      { id: "request-1", type: "say", say: "api_req_started", ts: "2026-08-01T00:00:01Z", text: JSON.stringify({ tokensIn: 100, tokensOut: 50, cacheReads: 20, cacheWrites: 5, cost: 0.12, apiProtocol: "anthropic" }) },
      { type: "say", say: "api_req_started", ts: "2026-08-01T00:00:02Z", text: "not-json" },
    ]))
    const warnings: string[] = []
    const [source] = await found(adapter, { platform: "linux", home, env: {}, extraRoots: [] })
    const output = await adapter.parse(source!, { timezone: "UTC", warn: (message) => warnings.push(message) })
    expect(output.events).toHaveLength(1)
    expect(output.events[0]).toMatchObject({ tokens: { input: 100, output: 50, cacheRead: 20, cacheWrite: 5, reasoning: 0 }, costUsd: 0.12, provider: "anthropic" })
    expect(warnings).toHaveLength(1)
  })

  it("uses the first non-blank Cline CLI override", async () => {
    const home = await mkdtemp(join(tmpdir(), "stats-cline-"))
    const root = join(home, "sessions")
    const path = join(root, "s1", "s1.messages.json")
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify([{ id: "m1", sessionId: "s1", timestamp: "2026-08-01T00:00:00Z", metrics: { input_tokens: 9, output_tokens: 4, cost: 0.03 } }]))
    const [source] = await found(clineAdapter, { platform: "linux", home, env: { CLINE_SESSION_DATA_DIR: "  ", CLINE_DATA_DIR: home }, extraRoots: [] })
    expect(source?.path).toBe(path)
    expect((await clineAdapter.parse(source!, parseContext)).events[0]?.tokens.input).toBe(9)
  })

  it("parses Copilot chat spans and stable dedup keys", async () => {
    const home = await mkdtemp(join(tmpdir(), "stats-copilot-"))
    const path = join(home, ".copilot", "otel", "one.jsonl")
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, [
      JSON.stringify({ type: "span", spanId: "tool", timestamp: "2026-08-01T00:00:00Z", attributes: { "gen_ai.operation.name": "tool" } }),
      JSON.stringify({ type: "span", spanId: "span-1", timestamp: "2026-08-01T00:00:01Z", attributes: { "gen_ai.operation.name": "chat", "gen_ai.response.model": "gpt-5", "gen_ai.conversation.id": "session-1", "gen_ai.usage.input_tokens": 12, "gen_ai.usage.output_tokens": 6, "gen_ai.usage.cache_read.input_tokens": 3, "gen_ai.usage.reasoning.output_tokens": 2 } }),
      "malformed",
    ].join("\n") + "\n")
    const [source] = await found(copilotCliAdapter, { platform: "linux", home, env: {}, extraRoots: [] })
    const warnings: string[] = []
    const output = await copilotCliAdapter.parse(source!, { timezone: "UTC", warn: (message) => warnings.push(message) })
    expect(output.events).toHaveLength(1)
    expect(output.events[0]).toMatchObject({ model: "gpt-5", dedupKey: "span-1:session-1:1785542401000", tokens: { input: 12, output: 6, cacheRead: 3, reasoning: 2 } })
    expect(warnings).toHaveLength(1)
  })

  it("discovers Devin Desktop ACP events by platform", async () => {
    const home = await mkdtemp(join(tmpdir(), "stats-devin-"))
    const path = join(home, "Library", "Application Support", "Devin", "User", "acp-events", "one.jsonl")
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, '{"id":"s1","timestamp":"2026-08-01T00:00:00Z","usage":{"input":7,"output":2}}\n')
    const [source] = await found(devinDesktopAdapter, { platform: "darwin", home, env: {}, extraRoots: [] })
    expect((await devinDesktopAdapter.parse(source!, parseContext)).events[0]?.tokens).toMatchObject({ input: 7, output: 2 })
  })
})
