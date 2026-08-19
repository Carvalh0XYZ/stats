import { join } from "node:path"
import { fileAdapter } from "./shared/factory"
import { parseJsonl } from "./shared/json"
import { usageRecord } from "./shared/usage-record"

export const codebuddyAdapter = fileAdapter({ id: "codebuddy", label: "CodeBuddy", roots: (context) => [join(context.home, ".codebuddy", "projects")], file: (name) => name.endsWith(".jsonl"), parse: (source, context) => parseJsonl({ agent: "codebuddy", source, context, record: usageRecord }) })
