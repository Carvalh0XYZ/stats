import { closeDb } from "../db/client.server"
import { getOverview, getBreakdown } from "../api/queries.server"
import { syncUsage } from "../sync/sync.server"

export interface HeadlessOptions {
  json: boolean
}

/** `--json` / `--sync` entry: sync all sources, print, exit code. */
export async function runHeadless(options: HeadlessOptions): Promise<number> {
  try {
    const result = await syncUsage({
      onProgress: progress => {
        if (process.stderr.isTTY) {
          process.stderr.write(`\r[${progress.current}/${progress.total}] syncing`)
        }
      },
    })
    if (process.stderr.isTTY) process.stderr.write("\r")
    console.error(
      `Synced ${result.inserted} new events from ${result.processed} files ` +
        `(${result.skipped} unchanged, ${result.warnings} warnings)`,
    )
    const filter = { range: "all" as const }
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            sync: result,
            overview: getOverview(filter),
            byAgent: getBreakdown(filter, "agent"),
            byModel: getBreakdown(filter, "model"),
          },
          null,
          2,
        ),
      )
    } else {
      const overview = getOverview(filter)
      console.log(`Total tokens:  ${overview.tokens.total.toLocaleString()}`)
      console.log(`Priced cost:   $${overview.pricedCostUsd.toFixed(2)}`)
      if (overview.unpricedEventCount > 0) {
        console.log(`Unpriced:      ${overview.unpricedEventCount} events / ${overview.unpricedTokens.toLocaleString()} tokens`)
      }
      console.log(`Sessions:      ${overview.sessions}`)
      console.log(`Active days:   ${overview.activeDays}`)
      console.log("")
      console.log("Top agents:")
      for (const row of getBreakdown(filter, "agent").slice(0, 10)) {
        console.log(
          `  ${row.label.padEnd(20)} ${row.tokens.total.toLocaleString().padStart(15)} tok  $${row.pricedCostUsd.toFixed(2)}${row.hasEstimatedTokens ? " (estimated)" : ""}`,
        )
      }
    }
    return 0
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error))
    return 1
  } finally {
    closeDb()
  }
}
