import { join } from "node:path"
import { envPath } from "../types"
import { fileAdapter } from "./shared/factory"
import { parseJsonl } from "./shared/json"
import { usageRecord } from "./shared/usage-record"

export const cherryStudioAdapter = fileAdapter({
  id: "cherry-studio",
  label: "Cherry Studio",
  roots: (context) => {
    const appData = envPath(context.env, "APPDATA")
    const xdg = envPath(context.env, "XDG_CONFIG_HOME") ?? join(context.home, ".config")
    const base = context.platform === "darwin"
      ? join(context.home, "Library", "Application Support", "CherryStudio")
      : context.platform === "win32" && appData
        ? join(appData, "CherryStudio")
        : join(xdg, "CherryStudio")
    return [
      join(base, "Data", "Agents", ".claude", "projects"),
      join(base, ".claude", "projects"),
    ]
  },
  file: (name) => name.endsWith(".jsonl"),
  parse: (source, context) => parseJsonl({ agent: "cherry-studio", source, context, record: usageRecord }),
})
