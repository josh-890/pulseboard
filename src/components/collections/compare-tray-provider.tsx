"use client";

import { useSyncExternalStore } from "react";

export type CompareTrayItem = { mediaItemId: string; thumbUrl: string | null };

// Module-level external store backed by sessionStorage (ephemeral, per-tab — like
// Lightroom's Quick Collection). useSyncExternalStore handles SSR/hydration without
// a setState-in-effect, so no hydration mismatch and no lint violation.
const STORAGE_KEY = "compareTray";
const EMPTY: CompareTrayItem[] = [];

let state: CompareTrayItem[] = EMPTY;
const listeners = new Set<() => void>();

function load() {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    state = raw ? (JSON.parse(raw) as CompareTrayItem[]) : EMPTY;
  } catch {
    state = EMPTY;
  }
}
load();

function commit(next: CompareTrayItem[]) {
  state = next;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

const trayStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot: () => state,
  getServerSnapshot: () => EMPTY,
  add(item: CompareTrayItem) {
    if (!state.some((i) => i.mediaItemId === item.mediaItemId)) commit([...state, item]);
  },
  remove(mediaItemId: string) {
    commit(state.filter((i) => i.mediaItemId !== mediaItemId));
  },
  clear() {
    commit(EMPTY);
  },
};

/** No-op wrapper kept so the root layout can mount the tray without prop drilling. */
export function CompareTrayProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useCompareTray() {
  const items = useSyncExternalStore(trayStore.subscribe, trayStore.getSnapshot, trayStore.getServerSnapshot);
  return {
    items,
    add: trayStore.add,
    remove: trayStore.remove,
    clear: trayStore.clear,
    has: (mediaItemId: string) => items.some((i) => i.mediaItemId === mediaItemId),
  };
}
