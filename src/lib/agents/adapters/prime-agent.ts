import { join } from "node:path"
import { fileAdapter } from "./shared/factory"
import { parseJsonl } from "./shared/json"
import { usageRecord } from "./shared/usage-record"

export const primeAgentAdapter = fileAdapter({ id: "prime-agent", label: "Prime Agent", roots: (context) => [join(context.home, ".prime", "agent", "sessions"), join(context.home, ".prime", "agent", "session-artifacts")], file: (name) => name.endsWith(".jsonl"), parse: (source, context) => parseJsonl({ agent: "prime-agent", source, context, record: usageRecord }) })
