import { describe, expect, it } from "vitest"
import { ADAPTERS } from "./index"
import { AGENT_IDS, AGENTS, type AgentId } from "./registry"

// The upstream source list captured at implementation time. A new source
// must be added here AND to the registry + an adapter.
const EXPECTED_AGENT_IDS: AgentId[] = [
  "claude-code", "codex", "gemini-cli", "opencode", "amp", "droid", "pi",
  "omp", "qwen-cli", "kimi", "mux", "grok-build", "openclaw", "prime-agent",
  "senpi", "kimchi", "reasonix", "gajae-code", "jcode", "junie", "augment",
  "opencodereview", "codebuddy", "workbuddy", "cherry-studio", "command-code",
  "deepseek-harness", "codebuff", "freebuff", "hermes", "kilo-cli", "goose",
  "zed", "kiro", "antigravity-cli", "mimo-code", "zcode", "devin-cli",
  "devin-desktop", "octofriend", "crush", "cline", "copilot-cli", "roo-code",
  "kilo-code", "cursor", "antigravity", "trae", "warp", "minimax-code",
  "sakana", "synthetic",
]

describe("agent registry", () => {
  it("covers the full expected source list", () => {
    expect([...AGENT_IDS].sort()).toEqual([...EXPECTED_AGENT_IDS].sort())
  })

  it("has one adapter per non-attributed agent", () => {
    const adapterIds = ADAPTERS.map(adapter => adapter.id).sort()
    const expected = AGENT_IDS.filter(id => AGENTS[id].kind !== "attributed").sort()
    expect(adapterIds).toEqual(expected)
    expect(new Set(adapterIds).size).toBe(adapterIds.length)
  })

  it("marks cache-backed adapters to match registry kind", () => {
    for (const adapter of ADAPTERS) {
      expect(adapter.cacheBacked ?? false).toBe(AGENTS[adapter.id].kind === "cache")
    }
  })
})
