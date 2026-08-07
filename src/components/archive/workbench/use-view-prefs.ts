'use client'

import { useCallback, useSyncExternalStore } from 'react'
import {
  DEFAULT_VIEW_PREFS,
  readViewPrefs,
  writeViewPrefs,
  type WorkbenchViewPrefs,
} from '@/lib/workbench-session'

/**
 * The `I` / `T` view preferences, shared by every workbench-shaped session.
 *
 * `localStorage` is exactly what `useSyncExternalStore` is for: React renders the
 * server snapshot (the defaults) during hydration and swaps in the stored value
 * on the client without a mismatch — and without the setState-in-effect that the
 * obvious version needs. A module-level cache keeps the snapshot referentially
 * stable, which the hook requires, and the listener set means two sessions open
 * at once agree about whether the filmstrip is showing.
 */
let cache: WorkbenchViewPrefs | null = null
const listeners = new Set<() => void>()

function clientSnapshot(): WorkbenchViewPrefs {
  cache ??= readViewPrefs(typeof window === 'undefined' ? undefined : window.localStorage)
  return cache
}

function serverSnapshot(): WorkbenchViewPrefs {
  return DEFAULT_VIEW_PREFS
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useViewPrefs(): [WorkbenchViewPrefs, (patch: Partial<WorkbenchViewPrefs>) => void] {
  const prefs = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot)

  const update = useCallback((patch: Partial<WorkbenchViewPrefs>) => {
    cache = { ...clientSnapshot(), ...patch }
    writeViewPrefs(typeof window === 'undefined' ? undefined : window.localStorage, cache)
    for (const listener of listeners) listener()
  }, [])

  return [prefs, update]
}
