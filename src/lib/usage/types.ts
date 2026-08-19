import type { AgentId } from "../agents/registry"

export interface TokenBreakdown {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
}

/**
 * Where a cost figure came from:
 * - "reported": the agent recorded the cost; never repriced.
 * - "estimated": priced from the models.dev catalog, or token counts
 *   themselves are estimates (e.g. ~4 chars/token sources).
 * - "unpriced": no reported cost and no catalog match; costUsd is null.
 */
export type CostSource = "reported" | "estimated" | "unpriced"

/** One normalized usage record. Metadata only — never transcript content. */
export interface UsageEvent {
  id: string
  agent: AgentId
  provider: string | null
  model: string | null
  sessionId: string
  project: string | null
  timestamp: number
  localDate: string
  tokens: TokenBreakdown
  costUsd: number | null
  costSource: CostSource
  durationMs: number | null
  dedupKey: string | null
  sourcePath: string
  /** True when token counts are estimates rather than agent-recorded values. */
  estimatedTokens?: boolean
}

export const ZERO_TOKENS: TokenBreakdown = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  reasoning: 0,
}

export function totalTokens(tokens: TokenBreakdown): number {
  return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite + tokens.reasoning
}
