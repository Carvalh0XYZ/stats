import type { AgentAdapter } from "./types"
import { ampAdapter } from "./adapters/amp"
import { antigravityAdapter } from "./adapters/antigravity"
import { antigravityCliAdapter } from "./adapters/antigravity-cli"
import { augmentAdapter } from "./adapters/augment"
import { cherryStudioAdapter } from "./adapters/cherry-studio"
import { claudeCodeAdapter } from "./adapters/claude-code"
import { clineAdapter } from "./adapters/cline"
import { codebuddyAdapter } from "./adapters/codebuddy"
import { codebuffAdapter } from "./adapters/codebuff"
import { codexAdapter } from "./adapters/codex"
import { commandCodeAdapter } from "./adapters/command-code"
import { copilotCliAdapter } from "./adapters/copilot-cli"
import { crushAdapter } from "./adapters/crush"
import { cursorAdapter } from "./adapters/cursor"
import { deepseekHarnessAdapter } from "./adapters/deepseek-harness"
import { devinDesktopAdapter } from "./adapters/devin-desktop"
import { droidAdapter } from "./adapters/droid"
import { kiloCodeAdapter, rooCodeAdapter } from "./adapters/editor-tasks"
import { freebuffAdapter } from "./adapters/freebuff"
import { gajaeCodeAdapter } from "./adapters/gajae-code"
import { geminiCliAdapter } from "./adapters/gemini-cli"
import { gooseAdapter } from "./adapters/goose"
import { grokBuildAdapter } from "./adapters/grok-build"
import { hermesAdapter } from "./adapters/hermes"
import { jcodeAdapter } from "./adapters/jcode"
import { junieAdapter } from "./adapters/junie"
import { kimchiAdapter } from "./adapters/kimchi"
import { kimiAdapter } from "./adapters/kimi"
import { kiroAdapter } from "./adapters/kiro"
import { minimaxCodeAdapter } from "./adapters/minimax-code"
import { muxAdapter } from "./adapters/mux"
import { ompAdapter } from "./adapters/omp"
import { openclawAdapter } from "./adapters/openclaw"
import { opencodeAdapter } from "./adapters/opencode"
import { opencodereviewAdapter } from "./adapters/opencodereview"
import { piAdapter } from "./adapters/pi"
import { primeAgentAdapter } from "./adapters/prime-agent"
import { qwenCliAdapter } from "./adapters/qwen-cli"
import { reasonixAdapter } from "./adapters/reasonix"
import { senpiAdapter } from "./adapters/senpi"
import { sqliteAgentAdapters } from "./adapters/sqlite-agents"
import { traeAdapter } from "./adapters/trae"
import { warpAdapter } from "./adapters/warp"
import { workbuddyAdapter } from "./adapters/workbuddy"
import { zcodeAdapter } from "./adapters/zcode"

/**
 * Every source-reading adapter. "attributed" agents (sakana, synthetic)
 * have no adapter of their own; host adapters emit their events.
 */
export const ADAPTERS: AgentAdapter[] = [
  ampAdapter,
  antigravityAdapter,
  antigravityCliAdapter,
  augmentAdapter,
  cherryStudioAdapter,
  claudeCodeAdapter,
  clineAdapter,
  codebuddyAdapter,
  codebuffAdapter,
  codexAdapter,
  commandCodeAdapter,
  copilotCliAdapter,
  crushAdapter,
  cursorAdapter,
  deepseekHarnessAdapter,
  devinDesktopAdapter,
  droidAdapter,
  freebuffAdapter,
  gajaeCodeAdapter,
  geminiCliAdapter,
  gooseAdapter,
  grokBuildAdapter,
  hermesAdapter,
  jcodeAdapter,
  junieAdapter,
  kiloCodeAdapter,
  kimchiAdapter,
  kimiAdapter,
  kiroAdapter,
  minimaxCodeAdapter,
  muxAdapter,
  ompAdapter,
  openclawAdapter,
  opencodeAdapter,
  opencodereviewAdapter,
  piAdapter,
  primeAgentAdapter,
  qwenCliAdapter,
  reasonixAdapter,
  rooCodeAdapter,
  senpiAdapter,
  ...sqliteAgentAdapters,
  traeAdapter,
  warpAdapter,
  workbuddyAdapter,
  zcodeAdapter,
]
