import { join } from "node:path"
import type { DiscoveryContext } from "../../types"
import { envPath } from "../../types"

// Cursor/Antigravity/Trae/Warp/MiniMax usage caches are written by external
// sync tooling under this fixed config directory; the path segment is part
// of the on-disk contract and cannot be renamed.
export function sharedCacheRoot(context: DiscoveryContext): string {
  const config = envPath(context.env, "XDG_CONFIG_HOME") ?? join(context.home, ".config")
  return join(config, "tokscale")
}

export function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function asNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}
