import { homedir } from "node:os"
import { join } from "node:path"

/** Platform data directory for stats.db, pricing cache, settings, sync lock. */
export function dataDir(): string {
  const override = process.env.TELEMETRY_STATS_DATA_DIR?.trim()
  if (override) return override
  const home = homedir()
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support", "telemetry-stats")
  }
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA?.trim()
    return join(local || join(home, "AppData", "Local"), "telemetry-stats")
  }
  const xdg = process.env.XDG_DATA_HOME?.trim()
  return join(xdg || join(home, ".local", "share"), "telemetry-stats")
}
