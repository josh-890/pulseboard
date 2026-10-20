"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";

// The merge basket (2026-10-20): two sessions gathered from anywhere — the
// /sessions grid, a session's or a set's ⋯ menu — across filters, searches and
// pages, then compared and merged. A merge is always a pair, so the basket holds
// two; a third makes room by dropping the first. Kept per tab in sessionStorage
// (like the photo compare tray): it survives navigation and reload, not closing.

export type MergeBasketItem = { id: string; name: string; thumbUrl: string | null };

const STORAGE_KEY = "mergeBasket";
const CAPACITY = 2;
const EMPTY: MergeBasketItem[] = [];

let state: MergeBasketItem[] = EMPTY;
const listeners = new Set<() => void>();

function isItem(x: unknown): x is MergeBasketItem {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.name === "string" && (o.thumbUrl === null || typeof o.thumbUrl === "string");
}

function load() {
  if (typeof window === "undefined") return;
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    state = Array.isArray(raw) ? raw.filter(isItem).slice(-CAPACITY) : EMPTY;
  } catch {
    state = EMPTY;
  }
}
load();

function commit(next: MergeBasketItem[]) {
  state = next;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode or blocked storage: the basket still works until reload */
  }
  listeners.forEach((l) => l());
}

export const mergeBasketStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot: () => state,
  getServerSnapshot: () => EMPTY,
  /** Adds the session; returns the one that made room, if any */
  add(item: MergeBasketItem): MergeBasketItem | null {
    if (state.some((i) => i.id === item.id)) return null;
    const dropped = state.length >= CAPACITY ? state[0]! : null;
    commit([...state.slice(state.length >= CAPACITY ? 1 : 0), item]);
    return dropped;
  },
  remove(...ids: string[]) {
    if (state.some((i) => ids.includes(i.id))) commit(state.filter((i) => !ids.includes(i.id)));
  },
  clear() {
    commit(EMPTY);
  },
};

export function useMergeBasket() {
  const items = useSyncExternalStore(mergeBasketStore.subscribe, mergeBasketStore.getSnapshot, mergeBasketStore.getServerSnapshot);
  return {
    items,
    has: (id: string) => items.some((i) => i.id === id),
    /** Adds or removes the session, saying what happened */
    toggle(item: MergeBasketItem) {
      if (mergeBasketStore.getSnapshot().some((i) => i.id === item.id)) {
        mergeBasketStore.remove(item.id);
        return;
      }
      const dropped = mergeBasketStore.add(item);
      if (dropped) toast(`Merge basket holds two — “${dropped.name}” made room for “${item.name}”`);
    },
    remove: mergeBasketStore.remove,
    clear: mergeBasketStore.clear,
  };
}
