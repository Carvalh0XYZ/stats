import { realpathSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { AgentAdapter } from "../types"
import { readJsonFile, walkFiles } from "../../usage/parse"
import {
  fileSession,
  recordOf,
  standardTokens,
  textOf,
  usageEvent,
} from "./shared/json"

export const ampAdapter: AgentAdapter = {
  id: "amp",
  label: "Amp",
  version: 3,
  async *discover(context) {
    const data =
      context.env.XDG_DATA_HOME?.trim() || join(context.home, ".local", "share")
    for (const path of await walkFiles(join(data, "amp", "threads"), (name) =>
      name.endsWith(".json")
    )) {
      yield { agent: "amp", path, kind: "json" }
    }
  },
  async parse(source, context) {
    const thread = recordOf(await readJsonFile(source.path))
    if (!thread) {
      context.warn("malformed JSON document")
      return { events: [] }
    }
    const sessionId = textOf(thread.id) ?? fileSession(source.path)
    const ledger = recordOf(thread.usageLedger)
    const ledgerEvents = Array.isArray(ledger?.events) ? ledger.events : []
    const values =
      ledgerEvents.length > 0
        ? ledgerEvents
        : Array.isArray(thread.messages)
          ? thread.messages
          : []
    const project = ampProject(thread)
    const events = []
    for (const [index, value] of values.entries()) {
      const item = recordOf(value)
      const usage =
        ledgerEvents.length > 0 ? recordOf(item?.tokens) : recordOf(item?.usage)
      if (
        !item ||
        !usage ||
        (ledgerEvents.length === 0 && item.role !== "assistant")
      )
        continue
      const model = textOf(item.model) ?? textOf(usage.model)
      if (!model) continue
      const event = usageEvent({
        agent: "amp",
        path: source.path,
        identity: (item.messageId as string | number) ?? index,
        provider: model.includes("claude")
          ? "anthropic"
          : model.includes("gemini")
            ? "google"
            : model.includes("gpt")
              ? "openai"
              : null,
        model,
        sessionId,
        project,
        timestamp:
          item.timestamp ??
          usage.timestamp ??
          item.createdAt ??
          (typeof thread.created === "number"
            ? thread.created + index * 1000
            : thread.created),
        timezone: context.timezone,
        tokens: standardTokens(usage),
        cost: item.credits ?? usage.credits,
        dedupKey:
          item.messageId === undefined
            ? null
            : `${sessionId}:${String(item.messageId)}`,
      })
      if (event) events.push(event)
      else context.warn("usage record has no valid timestamp")
    }
    return { events }
  },
}

function ampProject(thread: Record<string, unknown>): string | null {
  const env = recordOf(thread.env)
  const initial = recordOf(env?.initial)
  const trees = Array.isArray(initial?.trees) ? initial.trees : []
  const workspaceRoot =
    textOf(initial?.workspaceRoot) ??
    textOf(initial?.workingDirectory) ??
    textOf(initial?.cwd)
  const workspacePath = localPath(workspaceRoot)
  const activeTree =
    (workspacePath
      ? trees
          .map(recordOf)
          .find((tree) => fileUrlPath(tree?.uri) === workspacePath)
      : null) ?? recordOf(trees[0])
  const repository = recordOf(activeTree?.repository)
  const localRepository = localPath(textOf(repository?.url))
  const skillSnapshot = recordOf(thread.skillSnapshot)
  const meta = recordOf(thread.meta)
  return (
    textOf(thread.project) ??
    localRepository ??
    workspaceRoot ??
    textOf(skillSnapshot?.cliProxyAPIWorkspaceRoot) ??
    textOf(skillSnapshot?.cliProxyAPIWorkingDirectory) ??
    textOf(meta?.projectName)
  )
}

function fileUrlPath(value: unknown): string | null {
  const url = textOf(value)
  if (!url) return null
  try {
    return localPath(fileURLToPath(url))
  } catch {
    return null
  }
}

function localPath(value: string | null): string | null {
  if (!value || !isAbsolute(value)) return null
  const path = resolve(value)
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}
