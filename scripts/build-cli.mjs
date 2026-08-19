// Bundles the headless CLI (--json/--sync) next to the Nitro server output
// so bin/telemetry-stats.mjs can import it without the source tree.
import { build } from "esbuild"

await build({
  entryPoints: ["src/lib/cli/headless.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: ".output/server/cli.mjs",
  external: ["better-sqlite3"],
  alias: { "@": "./src" },
})
console.log("Built .output/server/cli.mjs")
