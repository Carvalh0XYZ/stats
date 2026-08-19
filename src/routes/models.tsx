import { createFileRoute } from "@tanstack/react-router"

import { parseStatsSearch } from "@/components/data/api"
import { BreakdownPage } from "@/components/breakdown-page"

export const Route = createFileRoute("/models")({
  validateSearch: parseStatsSearch,
  component: ModelsPage,
})

function ModelsPage() {
  return (
    <BreakdownPage
      filter={Route.useSearch()}
      dimension="model"
      title="Models"
      nameLabel="Model"
    />
  )
}
