import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, toApiError } from './api'

// Small keyed cache so moving between tabs and back does not refetch or flash.
// Entries are replaced on every successful load; nothing is ever synthesised.
const cache = new Map<string, unknown>()
const listeners = new Map<string, Set<() => void>>()

export function invalidate(prefix: string) {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
  for (const [key, set] of listeners) {
    if (key.startsWith(prefix)) set.forEach(fn => fn())
  }
}

export function clearCache() {
  cache.clear()
}

export interface Resource<T> {
  data: T | undefined
  error: ApiError | null
  loading: boolean
  reload: () => Promise<void>
}

export function useResource<T>(key: string | null, load: () => Promise<T>): Resource<T> {
  const [data, setData] = useState<T | undefined>(() => (key ? (cache.get(key) as T | undefined) : undefined))
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState<boolean>(() => !!key && !cache.has(key))
  const loadRef = useRef(load)
  loadRef.current = load
  const seq = useRef(0)

  const run = useCallback(async () => {
    if (!key) return
    const mine = ++seq.current
    if (!cache.has(key)) setLoading(true)
    setError(null)
    try {
      const value = await loadRef.current()
      if (mine !== seq.current) return
      cache.set(key, value)
      setData(value)
    } catch (e) {
      if (mine !== seq.current) return
      setError(toApiError(e))
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [key])

  useEffect(() => {
    if (!key) return
    setData(cache.get(key) as T | undefined)
    void run()
    const set = listeners.get(key) ?? new Set()
    set.add(run)
    listeners.set(key, set)
    return () => { set.delete(run) }
  }, [key, run])

  return { data, error, loading, reload: run }
}
