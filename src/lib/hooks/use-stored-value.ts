"use client";

import { useCallback, useSyncExternalStore } from "react";

// A per-viewer setting kept in localStorage (a gallery's sort, its grouping).
// Reading it in a useState initializer renders the stored value on the client
// but the default on the server — a hydration mismatch. useSyncExternalStore
// renders the default while hydrating and the stored value right after.

const listeners = new Set<() => void>();
/** This tab's values — they still apply when storage is unavailable */
const memory = new Map<string, string>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

/** The stored string for `key` (or `fallback`), and a setter that stores it */
export function useStoredValue<T extends string>(key: string, fallback: T): [T, (value: T) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const set = useCallback(
    (value: T) => {
      memory.set(key, value);
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* storage unavailable — remembered for this tab only */
      }
      for (const l of listeners) l();
    },
    [key],
  );
  return [(stored as T | null) ?? fallback, set];
}
