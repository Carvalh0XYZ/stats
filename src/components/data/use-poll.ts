import * as React from "react"

export interface PollState<T> {
  data: T | null
  error: string | null
  loading: boolean
  updatedAt: number | null
  refresh: () => void
}

/**
 * Fetches on mount and every `intervalMs` (default 30s), refetching whenever
 * `key` changes. Stale responses from superseded requests are dropped.
 */
export function usePoll<T>(
  load: () => Promise<T>,
  key: string,
  intervalMs = 30_000
): PollState<T> {
  const [data, setData] = React.useState<T | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [updatedAt, setUpdatedAt] = React.useState<number | null>(null)
  const [tick, setTick] = React.useState(0)
  const loadRef = React.useRef(load)
  loadRef.current = load

  React.useEffect(() => {
    let alive = true
    let generation = 0

    const run = async (initial: boolean) => {
      const id = ++generation
      if (initial) setLoading(true)
      try {
        const next = await loadRef.current()
        if (!alive || id !== generation) return
        setData(next)
        setError(null)
        setUpdatedAt(Date.now())
      } catch (cause) {
        if (!alive || id !== generation) return
        setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (alive && id === generation) setLoading(false)
      }
    }

    void run(true)
    const timer = setInterval(() => void run(false), intervalMs)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [key, tick, intervalMs])

  const refresh = React.useCallback(() => setTick((n) => n + 1), [])

  return { data, error, loading, updatedAt, refresh }
}
