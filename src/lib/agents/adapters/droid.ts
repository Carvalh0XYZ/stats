import { basename, dirname, join } from "node:path"
import type { AgentAdapter } from "../types"
import { readJsonFile, walkFiles } from "../../usage/parse"
import { recordOf, standardTokens, textOf, usageEvent } from "./shared/json"

export const droidAdapter: AgentAdapter = {
  id: "droid",
  label: "Droid",
  version: 2,
  async *discover(context) {
    for (const path of await walkFiles(join(context.home, ".factory", "sessions"), (name) => name.endsWith(".settings.json"))) {
      yield { agent: "droid", path, kind: "settings" }
    }
  },
  async parse(source, context) {
    const settings = recordOf(await readJsonFile(source.path))
    const usage = recordOf(settings?.tokenUsage)
    if (!settings || !usage) {
      context.warn("malformed Droid settings")
      return { events: [] }
    }
    const sessionId = basename(source.path, ".settings.json")
    const event = usageEvent({
      agent: "droid",
      path: source.path,
      identity: sessionId,
      provider: textOf(settings.providerLock),
      model: normalizeModel(textOf(settings.model)),
      sessionId,
      project: basename(dirname(source.path)),
      timestamp: settings.providerLockTimestamp ?? settings.updatedAt,
      timezone: context.timezone,
      tokens: standardTokens(usage),
      dedupKey: null,
    })
    if (!event) context.warn("settings have no valid timestamp")
    return { events: event ? [event] : [] }
  },
}

/**
 * Droid labels BYOK models "custom:<Harness>:-<Model>-(<tier>)-<n>", e.g.
 * "custom:Codex:-GPT-5.4-(high)-5". Reduce the label to the underlying
 * catalog model id so pricing can resolve it; Claude family names also gain
 * their "claude-" prefix and dash-separated version ("Opus-4.6" →
 * "claude-opus-4-6").
 */
function normalizeModel(model: string | null): string | null {
  if (!model?.startsWith("custom:")) return model
  const label = model
    .slice("custom:".length)
    .replace(/^[A-Za-z][A-Za-z0-9-]*:-/u, "")
    .replace(/-\((?:low|medium|high|xhigh)\)-\d+$/iu, "")
    .toLowerCase()
  if (/^(?:opus|sonnet|haiku)-/u.test(label)) return `claude-${label.replaceAll(".", "-")}`
  return label
}
