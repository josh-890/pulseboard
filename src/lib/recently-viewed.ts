import { ENTITY_BASE, type KeyValueStorage, type TrailEntityType } from "@/lib/browse-trail";

/**
 * Recently viewed (2026-11-13): the last detail pages you opened, newest first,
 * in localStorage — one list per browser, shown in the top bar's "Recent"
 * popover and on top of quick jump. A page you open again moves to the front.
 */

export type RecentItem = {
  type: TrailEntityType;
  id: string;
  /** Shown as is; people as `Name (ICG-ID)` */
  name: string;
  at: number;
};

export const RECENT_STORAGE_KEY = "pulseboard-recent";
/** Fired on window after a change, so this tab's popover updates (storage events only reach other tabs) */
export const RECENT_EVENT = "pulseboard-recent-change";
export const MAX_RECENT = 15;

const TYPES = new Set<string>(Object.keys(ENTITY_BASE));

export function parseRecent(raw: string | null): RecentItem[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (x): x is RecentItem =>
        typeof x === "object" &&
        x !== null &&
        TYPES.has((x as RecentItem).type) &&
        typeof (x as RecentItem).id === "string" &&
        typeof (x as RecentItem).name === "string" &&
        typeof (x as RecentItem).at === "number",
    );
  } catch {
    return [];
  }
}

/** Puts the item first (dropping its older copy) and keeps the newest MAX_RECENT */
export function addRecent(list: RecentItem[], item: RecentItem): RecentItem[] {
  return [item, ...list.filter((x) => !(x.type === item.type && x.id === item.id))].slice(0, MAX_RECENT);
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function recordRecent(item: Omit<RecentItem, "at">, storage = defaultStorage(), now = Date.now()): void {
  if (!storage) return;
  try {
    const next = addRecent(parseRecent(storage.getItem(RECENT_STORAGE_KEY)), { ...item, at: now });
    storage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: Recent is a convenience, never an error
  }
}

export function clearRecent(storage = defaultStorage()): void {
  try {
    storage?.setItem(RECENT_STORAGE_KEY, "[]");
  } catch {
    // ignore
  }
}

export function recentHref(item: Pick<RecentItem, "type" | "id">): string {
  return `${ENTITY_BASE[item.type]}/${item.id}`;
}

/** For useSyncExternalStore: this tab's changes (RECENT_EVENT) and other tabs' (storage) */
export function subscribeRecent(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === RECENT_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(RECENT_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(RECENT_EVENT, onChange);
  };
}

export function readRecentRaw(): string | null {
  try {
    return window.localStorage.getItem(RECENT_STORAGE_KEY);
  } catch {
    return null;
  }
}
