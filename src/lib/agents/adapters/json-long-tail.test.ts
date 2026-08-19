import { promises as fs } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, it } from "vitest"
import type { AgentAdapter, DiscoveryContext, UsageSource } from "../types"
import { grokBuildAdapter } from "./grok-build"
import { commandCodeAdapter } from "./command-code"
import { kimiAdapter } from "./kimi"
import { senpiAdapter } from "./senpi"

async function tempHome(): Promise<string> {
  return fs.mkdtemp(join(tmpdir(), "telemetry-adapter-"))
}

function discovery(home: string, env: Record<string, string | undefined> = {}): DiscoveryContext {
  return { platform: "linux", home, env, extraRoots: [] }
}

async function paths(adapter: AgentAdapter, context: DiscoveryContext): Promise<UsageSource[]> {
  const found: UsageSource[] = []
  for await (const source of adapter.discover(context)) found.push(source)
  return found
}

const parseContext = { timezone: "UTC", warn: (_message: string) => undefined }

describe("JSON long-tail adapters", () => {
  it("parses pi-format usage and skips malformed lines", async () => {
    const home = await tempHome()
    const root = join(home, ".senpi", "agent", "sessions")
    await fs.mkdir(root, { recursive: true })
    const path = join(root, "session.jsonl")
    await fs.writeFile(path, [
      JSON.stringify({ type: "session", id: "session-1", cwd: "/repo" }),
      "not json",
      JSON.stringify({ type: "message", id: "msg-1", timestamp: "2026-08-01T00:00:00Z", message: { role: "assistant", model: "kimi", provider: "senpi", usage: { input: 10, output: 4, cacheRead: 3, cacheWrite: 2 } } }),
      "",
    ].join("\n"))
    const warnings: string[] = []
    const result = await senpiAdapter.parse((await paths(senpiAdapter, discovery(home)))[0]!, { timezone: "UTC", warn: (message) => warnings.push(message) })
    expect(result.events).toHaveLength(1)
    expect(result.events[0]?.tokens).toEqual({ input: 10, output: 4, cacheRead: 3, cacheWrite: 2, reasoning: 0 })
    expect(result.events[0]?.dedupKey).toBe("session-1:msg-1")
    expect(warnings).toHaveLength(1)
  })

  it("converts Grok cumulative totals to positive deltas", async () => {
    const home = await tempHome()
    const root = join(home, ".grok", "sessions", "work", "session")
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(join(root, "updates.jsonl"), [
      JSON.stringify({ id: "one", timestamp: 1785542400000, params: { update: { usage: { totalTokens: 100 } } } }),
      JSON.stringify({ id: "two", timestamp: 1785542401000, params: { update: { usage: { totalTokens: 145 } } } }),
      JSON.stringify({ id: "three", timestamp: 1785542402000, params: { update: { usage: { totalTokens: 120 } } } }),
      "",
    ].join("\n"))
    const result = await grokBuildAdapter.parse((await paths(grokBuildAdapter, discovery(home)))[0]!, parseContext)
    expect(result.events.map((event) => event.tokens.input)).toEqual([100, 45])
  })

  it("marks Command Code message-length estimates", async () => {
    const home = await tempHome()
    const root = join(home, ".commandcode", "projects", "repo")
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(join(root, "session.jsonl"), `${JSON.stringify({ id: "a", role: "assistant", timestamp: 1785542400000, messageLength: 17 })}\n`)
    const result = await commandCodeAdapter.parse((await paths(commandCodeAdapter, discovery(home)))[0]!, parseContext)
    expect(result.events[0]?.tokens.output).toBe(5)
    expect(result.events[0]?.estimatedTokens).toBe(true)
    expect(result.events[0]?.costSource).toBe("unpriced")
  })

  it("uses KIMI_CODE_HOME and keeps stable dedup identity", async () => {
    const home = await tempHome()
    const override = join(home, "kimi-home")
    const root = join(override, "sessions")
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(join(root, "wire.jsonl"), `${JSON.stringify({ type: "usage.record", id: "usage-1", timestamp: 1785542400000, usage: { inputOther: 8, output: 2, inputCacheRead: 4 } })}\n`)
    const source = (await paths(kimiAdapter, discovery(home, { KIMI_CODE_HOME: override })))[0]!
    const first = await kimiAdapter.parse(source, parseContext)
    const second = await kimiAdapter.parse(source, parseContext)
    expect(first.events[0]?.tokens).toEqual({ input: 8, output: 2, cacheRead: 4, cacheWrite: 0, reasoning: 0 })
    expect(first.events[0]?.dedupKey).toBe(second.events[0]?.dedupKey)
  })
})
