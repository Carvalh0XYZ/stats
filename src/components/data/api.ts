import type { StatsFilter, TimeRange } from "@/lib/api/types"
import { TIME_RANGES } from "@/lib/api/types"
import { isAgentId, type AgentId } from "@/lib/agents/registry"

/** Wire shape of GET/PUT /api/settings (server-owned endpoint). */
export interface AppSettings {
  dataDir: string
  timezone: string
  extraRoots: string[]
  pricing: { fetchedAt: number } | null
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    throw new ApiError(res.status, `${path} failed with ${res.status}`)
  }
  return (await res.json()) as T
}

/** Builds `/api/<endpoint>?range=…&agent=…` from the shared filter. */
export function statsUrl(
  endpoint: string,
  filter: StatsFilter,
  extra?: Record<string, string>
): string {
  const params = new URLSearchParams()
  params.set("range", filter.range)
  for (const agent of filter.agents ?? []) {
    params.append("agent", agent)
  }
  if (filter.from) params.set("from", filter.from)
  if (filter.to) params.set("to", filter.to)
  for (const [key, value] of Object.entries(extra ?? {})) {
    params.set(key, value)
  }
  return `/api/${endpoint}?${params.toString()}`
}

export function saveSettings(patch: {
  extraRoots: string[]
  timezone: string
}): Promise<AppSettings> {
  return getJson("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  })
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Validates URL search params into the shared analytics filter. */
export function parseStatsSearch(input: Record<string, unknown>): StatsFilter {
  const search: StatsFilter = { range: "30d" }
  const range = input["range"]
  if (typeof range === "string" && (TIME_RANGES as string[]).includes(range)) {
    search.range = range as TimeRange
  }
  const raw = input["agents"]
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : []
  const agents = list.filter(
    (value): value is AgentId => typeof value === "string" && isAgentId(value)
  )
  if (agents.length > 0) search.agents = agents
  const from = input["from"]
  if (typeof from === "string" && ISO_DATE.test(from)) search.from = from
  const to = input["to"]
  if (typeof to === "string" && ISO_DATE.test(to)) search.to = to
  return search
}
