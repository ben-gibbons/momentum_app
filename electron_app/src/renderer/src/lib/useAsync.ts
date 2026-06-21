// lib/useAsync.ts
// Generic data-fetching hook — the convention every screen follows for reading from window.api.
// Runs an async fn on mount (and when deps change), tracks loading/error, and exposes reload() to
// refetch after a mutation. All setState happens inside the promise callbacks (not synchronously in
// the effect body), and a tick counter drives reload — keeping the hook clean under the react-hooks
// rules. A cancelled flag guards against setting state after unmount or a superseded fetch.
import { useCallback, useEffect, useState } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  loading: boolean
  error: Error | null
  reload: () => void
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    fn()
      .then((d) => {
        if (cancelled) return
        setData(d)
        setError(null)
      })
      .catch((e) => {
        if (!cancelled) setError(e as Error)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // fn identity changes each render; the caller-provided deps (+ tick for reload) are the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { data, loading, error, reload }
}
