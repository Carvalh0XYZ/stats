import { join } from "node:path"
import { fileAdapter } from "./shared/factory"
import { parseJsonl } from "./shared/json"
import { usageRecord } from "./shared/usage-record"

export const opencodereviewAdapter = fileAdapter({ id: "opencodereview", label: "OpenCodeReview", roots: (context) => [join(context.home, ".opencodereview", "sessions")], file: (name) => name.endsWith(".jsonl"), parse: (source, context) => parseJsonl({ agent: "opencodereview", source, context, record: usageRecord }) })
