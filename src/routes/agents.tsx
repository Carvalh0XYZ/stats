import { createFileRoute } from "@tanstack/react-router"

import { parseStatsSearch } from "@/components/data/api"
import { BreakdownPage } from "@/components/breakdown-page"

export const Route = createFileRoute("/agents")({
  validateSearch: parseStatsSearch,
  component: AgentsPage,
})

function AgentsPage() {
  return (
    <BreakdownPage
      filter={Route.useSearch()}
      dimension="agent"
      title="Agents"
      nameLabel="Agent"
    />
  )
}
