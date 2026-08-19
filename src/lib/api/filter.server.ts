import { isAgentId } from "../agents/registry"
import { TIME_RANGES, type StatsFilter, type TimeRange } from "./types"

/** Parse the shared filter query params from a request URL. */
export function filterFromUrl(url: URL): StatsFilter {
  const rangeParam = url.searchParams.get("range")
  const range: TimeRange = TIME_RANGES.includes(rangeParam as TimeRange)
    ? (rangeParam as TimeRange)
    : "30d"
  const agents = url.searchParams.getAll("agent").filter(isAgentId)
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const isoDay = /^\d{4}-\d{2}-\d{2}$/
  return {
    range,
    agents: agents.length ? agents : undefined,
    from: from && isoDay.test(from) ? from : undefined,
    to: to && isoDay.test(to) ? to : undefined,
  }
}
