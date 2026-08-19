import { join } from "node:path"
import { fileAdapter } from "./shared/factory"
import { parseJsonl } from "./shared/json"
import { usageRecord } from "./shared/usage-record"

export const muxAdapter = fileAdapter({ id: "mux", label: "Mux", roots: (context) => [join(context.home, ".mux", "sessions")], file: (name) => name.endsWith(".jsonl"), parse: (source, context) => parseJsonl({ agent: "mux", source, context, record: usageRecord }) })
