import { join } from "node:path"
import { fileAdapter } from "./shared/factory"
import { parseJsonl } from "./shared/json"
import { usageRecord } from "./shared/usage-record"

export const openclawAdapter = fileAdapter({ id: "openclaw", label: "OpenClaw", roots: (context) => [".openclaw", ".clawdbot", ".moltbot", ".moldbot"].map((root) => join(context.home, root, "agents")), file: (name) => name.endsWith(".jsonl"), parse: (source, context) => parseJsonl({ agent: "openclaw", source, context, record: usageRecord }) })
