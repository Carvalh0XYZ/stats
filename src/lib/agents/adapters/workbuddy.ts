import { join } from "node:path"
import { fileAdapter } from "./shared/factory"
import { parseJsonl } from "./shared/json"
import { usageRecord } from "./shared/usage-record"

export const workbuddyAdapter = fileAdapter({ id: "workbuddy", label: "WorkBuddy", roots: (context) => [join(context.home, ".workbuddy", "projects")], file: (name) => name.endsWith(".jsonl"), parse: (source, context) => parseJsonl({ agent: "workbuddy", source, context, record: usageRecord }) })
