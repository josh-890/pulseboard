/**
 * The browse trail (2026-11-13): "the list you came from travels with you".
 *
 * Any list of entity links on any page (an artist's models, a set's cast, a
 * person's sets …) becomes a trail entry when you click into it. The detail page
 * gets `?via=<entryId>` in its URL and shows "← Back to {title}" plus prev/next
 * through exactly that list. An entry remembers the entry of the page its list
 * sat on (`parentId`), so the chain climbs back up: Artist X · Models ›
 * Person A · Sets › …
 *
 * Entries live in localStorage (by id, so reload, Back/Forward and a new tab all
 * keep the right track), pruned to the newest MAX_ENTRIES and TTL_MS. Without a
 * `via` the detail pages fall back to the gallery browse context
 * (`browse-context.ts`) exactly as before.
 *
 * Client-safe: no server imports. The storage is injectable for tests.
 */

export type TrailEntityType =
  | "person"
  | "set"
  | "session"
  | "channel"
  | "label"
  | "artist"
  | "project"
  | "collection"
  | "contact";

export type TrailEntry = {
  id: string;
  /** What the list is, e.g. "Artist X · Models shot most" */
  title: string;
  /** The page the list sits on, as it was (path + query, incl. its own via) */
  returnHref: string;
  entityType: TrailEntityType;
  ids: string[];
  names: string[];
  /** Scroll offset of the list page when you left it */
  scrollY: number;
  /** The entry of the page the list sat on (the level above), if any */
  parentId: string | null;
  createdAt: number;
};

export type TrailNav = {
  index: number;
  total: number;
  prevId: string | null;
  prevName: string | null;
  nextId: string | null;
  nextName: string | null;
};

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

export const TRAIL_STORAGE_KEY = "pulseboard-trail";
export const TRAIL_SCROLL_KEY = "pulseboard-trail-scroll";
export const MAX_ENTRIES = 50;
export const TTL_MS = 2 * 24 * 60 * 60 * 1000;
/** How many levels the crumb row shows (the current one included) */
export const MAX_DEPTH = 4;

type Store = Record<string, TrailEntry>;

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readStore(storage: KeyValueStorage | null): Store {
  if (!storage) return {};
  try {
    const raw = storage.getItem(TRAIL_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

/** Parse the store from its raw string (for useSyncExternalStore snapshots) */
export function parseTrailStore(raw: string | null): Store {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

/** Save an entry; drops expired ones and keeps the newest MAX_ENTRIES */
export function saveTrailEntry(
  entry: TrailEntry,
  storage: KeyValueStorage | null = defaultStorage(),
  now = Date.now(),
): void {
  if (!storage) return;
  const store = readStore(storage);
  store[entry.id] = entry;
  const kept = Object.values(store)
    .filter((e) => now - e.createdAt < TTL_MS)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ENTRIES);
  try {
    storage.setItem(TRAIL_STORAGE_KEY, JSON.stringify(Object.fromEntries(kept.map((e) => [e.id, e]))));
  } catch {
    // storage full or unavailable — the trail is a courtesy
  }
}

export function loadTrailEntry(
  id: string,
  storage: KeyValueStorage | null = defaultStorage(),
): TrailEntry | null {
  return readStore(storage)[id] ?? null;
}

/** The chain ending at `id`, root first, at most MAX_DEPTH long (cycle-safe) */
export function trailChain(id: string, store: Store, maxDepth = MAX_DEPTH): TrailEntry[] {
  const chain: TrailEntry[] = [];
  const seen = new Set<string>();
  let cur: TrailEntry | undefined = store[id];
  while (cur && !seen.has(cur.id) && chain.length < maxDepth) {
    chain.unshift(cur);
    seen.add(cur.id);
    cur = cur.parentId ? store[cur.parentId] : undefined;
  }
  return chain;
}

/** Position of an entity in the entry's list, or null when it isn't in it */
export function trailNav(entry: TrailEntry, entityId: string): TrailNav | null {
  const index = entry.ids.indexOf(entityId);
  if (index === -1) return null;
  const prev = index > 0 ? index - 1 : null;
  const next = index < entry.ids.length - 1 ? index + 1 : null;
  return {
    index,
    total: entry.ids.length,
    prevId: prev === null ? null : entry.ids[prev],
    prevName: prev === null ? null : entry.names[prev] ?? null,
    nextId: next === null ? null : entry.ids[next],
    nextName: next === null ? null : entry.names[next] ?? null,
  };
}

/** Short, unique-enough id (crypto.randomUUID is missing on plain-http prod) */
export function newTrailId(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

export const ENTITY_BASE: Record<TrailEntityType, string> = {
  person: "/people",
  set: "/sets",
  session: "/sessions",
  channel: "/channels",
  label: "/labels",
  artist: "/artists",
  project: "/projects",
  collection: "/collections",
  contact: "/people/contacts",
};

/** Static routes that sit where an id would */
const NOT_IDS: Partial<Record<TrailEntityType, string[]>> = {
  person: ["contacts"],
  session: ["merge", "rate"],
  channel: ["check"],
  collection: ["smart"],
  contact: ["runs"],
};

const SEGMENT_TYPE: Record<string, TrailEntityType> = {
  people: "person",
  sets: "set",
  sessions: "session",
  channels: "channel",
  labels: "label",
  artists: "artist",
  projects: "project",
  collections: "collection",
};

/** "/people/abc?tab=x" → { type: "person", id: "abc" }; anything else → null */
export function parseEntityHref(href: string | null): { type: TrailEntityType; id: string } | null {
  if (!href || !href.startsWith("/")) return null;
  const path = href.split(/[?#]/)[0].replace(/\/+$/, "");
  const parts = path.split("/").filter(Boolean);
  let type: TrailEntityType | undefined;
  let id: string | undefined;
  if (parts.length === 3 && parts[0] === "people" && parts[1] === "contacts") {
    type = "contact";
    id = parts[2];
  } else if (parts.length === 2) {
    type = SEGMENT_TYPE[parts[0]];
    id = parts[1];
  }
  if (!type || !id) return null;
  if (NOT_IDS[type]?.includes(id)) return null;
  return { type, id: decodeURIComponent(id) };
}

/** Set (or drop) the `via` param of a same-origin href, keeping everything else */
export function withVia(href: string, via: string | null): string {
  const [beforeHash, hash] = href.split("#", 2);
  const [path, query = ""] = beforeHash.split("?", 2);
  const params = new URLSearchParams(query);
  if (via) params.set("via", via);
  else params.delete("via");
  const qs = params.toString();
  return `${path}${qs ? `?${qs}` : ""}${hash !== undefined ? `#${hash}` : ""}`;
}

/** A sibling's detail href on the same trail, keeping the current tab */
export function siblingHref(type: TrailEntityType, id: string, via: string, tab: string | null): string {
  const params = new URLSearchParams();
  if (tab) params.set("tab", tab);
  params.set("via", via);
  return `${ENTITY_BASE[type]}/${encodeURIComponent(id)}?${params.toString()}`;
}

/** Remember where to scroll once the list page is back (read by TrailScrollRestore) */
export function setPendingScroll(href: string, y: number): void {
  try {
    sessionStorage.setItem(TRAIL_SCROLL_KEY, JSON.stringify({ href, y, at: Date.now() }));
  } catch {
    // ignore
  }
}

export function takePendingScroll(currentHref: string, now = Date.now()): number | null {
  try {
    const raw = sessionStorage.getItem(TRAIL_SCROLL_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { href: string; y: number; at: number };
    if (p.href !== currentHref) return null;
    sessionStorage.removeItem(TRAIL_SCROLL_KEY);
    return now - p.at < 30_000 ? p.y : null;
  } catch {
    return null;
  }
}

/** A readable name for a link: data-trail-name, aria-label, or its text */
export function linkName(a: { dataset: DOMStringMap; getAttribute(n: string): string | null; textContent: string | null }): string {
  const raw = a.dataset.trailName ?? a.getAttribute("aria-label") ?? a.textContent ?? "";
  const name = raw.replace(/\s+/g, " ").trim();
  return name.length > 40 ? `${name.slice(0, 39)}…` : name;
}
