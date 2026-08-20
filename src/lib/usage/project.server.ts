import { existsSync } from "node:fs"
import { homedir } from "node:os"

// Agents record the same working directory in different shapes:
//   /Users/ephraim/dev/telemetry.dev      raw cwd
//   /dev/telemetry.dev                    home-relative
//   -Users-ephraim-dev-telemetry.dev      dash-encoded log directory name
//   /dev/roadmap/sync                     dash-encoded name over-split on "-"
// canonicalProject maps all of them to one absolute path so the same project
// never appears twice in breakdowns, sessions, or top lists. Resolution is
// filesystem-backed: a candidate wins only when the directory exists.

const HOME = homedir()
const cache = new Map<string, string | null>()

export function canonicalProject(raw: string | null): string | null {
  if (raw === null) return null
  const trimmed = raw.trim()
  if (trimmed === "") return null
  const hit = cache.get(trimmed)
  if (hit !== undefined) return hit
  const result = resolveProject(trimmed)
  cache.set(trimmed, result)
  return result
}

/** Shortens a canonical path for display: /Users/me/dev/x -> ~/dev/x. */
export function displayProject(project: string | null): string | null {
  if (project === null) return null
  return project.startsWith(`${HOME}/`) ? `~${project.slice(HOME.length)}` : project
}

function resolveProject(raw: string): string {
  const base = raw.startsWith("-")
    ? `/${raw.slice(1)}`
    : raw.startsWith("~")
      ? HOME + raw.slice(1)
      : raw
  if (!base.startsWith("/")) return raw
  const decoded = base.replaceAll("-", "/")
  // Home-anchored candidates first: "/dev/x" almost always means "~/dev/x",
  // and system directories such as /dev exist and would win otherwise. A raw
  // absolute path is unaffected because HOME + "/Users/..." never exists.
  const candidates =
    decoded === base
      ? [HOME + base, base]
      : [HOME + base, HOME + decoded, base, decoded]
  for (const candidate of candidates) {
    const resolved = resolveSegments("", candidate.split("/").filter(Boolean), 0)
    if (resolved !== null) return resolved
  }
  return raw
}

/**
 * Rejoins slash-split segments against the filesystem. Dash-encoded names are
 * lossy ("roadmap-sync" encodes like "roadmap/sync"), so when a segment does
 * not exist as a directory the search merges it with the next segment using
 * "-" and tries again, backtracking across interpretations.
 */
function resolveSegments(current: string, segments: string[], index: number): string | null {
  if (index === segments.length) return current === "" ? null : current
  let name = segments[index]
  for (let next = index + 1; ; next++) {
    const candidate = `${current}/${name}`
    if (existsSync(candidate)) {
      const resolved = resolveSegments(candidate, segments, next)
      if (resolved !== null) return resolved
    }
    if (next === segments.length) return null
    name = `${name}-${segments[next]}`
  }
}
