import type { AgentId } from "./registry"
import type { UsageEvent } from "../usage/types"

/** Environment for path discovery. Blank env values are treated as unset. */
export interface DiscoveryContext {
  platform: NodeJS.Platform
  home: string
  env: Record<string, string | undefined>
  /** User-configured additional scan roots. */
  extraRoots: string[]
}

/** One parseable unit: a file or database an adapter discovered. */
export interface UsageSource {
  agent: AgentId
  /** Absolute path to the file or database. */
  path: string
  /** Distinguishes formats when one adapter reads several ("jsonl", "sqlite", "legacy"). */
  kind: string
}

export interface ParseContext {
  /** IANA timezone pinned in app settings; used for every localDate. */
  timezone: string
  /** Byte offset to resume from, for append-only sources. Undefined = parse all. */
  resumeOffset?: number
  /** Opaque adapter state persisted alongside the resume offset. */
  resumeState?: string
  warn: (message: string) => void
}

export interface ParseOutput {
  events: UsageEvent[]
  /** Delete previously persisted events before inserting this full parse. */
  replaceExisting?: boolean
  /**
   * Byte offset consumed up to the last complete record, for append-only
   * sources. Omit when resume is unsafe (rewritten or non-linear formats).
   */
  cursor?: number
  /** Opaque adapter state required to continue from the cursor. */
  state?: string
}

/**
 * One adapter per agent. Adapters own path discovery, schema validation,
 * cumulative-to-delta conversion, and dedup-key identity. They never touch
 * the app database or compute dashboard aggregates.
 */
export interface AgentAdapter {
  id: AgentId
  label: string
  /** Bumping invalidates previously parsed rows for this adapter only. */
  version: number
  /** True for adapters that read caches produced by external sync tooling. */
  cacheBacked?: boolean
  discover(context: DiscoveryContext): AsyncIterable<UsageSource>
  parse(source: UsageSource, context: ParseContext): Promise<ParseOutput>
}

/** Read an env var, ignoring blank or whitespace-only values. */
export function envPath(
  env: DiscoveryContext["env"],
  name: string
): string | undefined {
  const value = env[name]?.trim()
  return value ? value : undefined
}
