/**
 * Client-side browse context for prev/next navigation on detail pages.
 * Uses sessionStorage to persist ordered ID list, display names, scroll position,
 * and pagination cursor across page navigations.
 */

const STORAGE_KEY = "pulseboard-browse-context";
export const SESSION_BROWSE_KEY = "pulseboard-session-browse-context";
export const SET_BROWSE_KEY = "pulseboard-set-browse-context";

export type BrowseContext = {
  /** Ordered list of entity IDs in the current browse subset */
  ids: string[];
  /** Parallel array of display names (truncated) for prev/next preview */
  names: string[];
  /** Cursor for loading next batch (null = no more) */
  nextCursor: string | null;
  /** Total count of the full subset */
  totalCount: number;
  /** Filter snapshot — used to detect stale context on browser return */
  filters: Record<string, string>;
  /** Headshot slot filter value (people only) */
  slot?: number;
  /** Scroll offset (pixels from top of page) */
  scrollY: number;
};

export type BrowseNav = {
  /** 0-based position in ids[] */
  index: number;
  /** totalCount (full subset) */
  total: number;
  /** ids.length (loaded so far) */
  loaded: number;
  prevId: string | null;
  prevName: string | null;
  nextId: string | null;
  nextName: string | null;
  /** true if at last loaded item and more exist (trigger boundary fetch) */
  isAtEnd: boolean;
};

export function saveBrowseContext(ctx: BrowseContext, key = STORAGE_KEY): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(ctx));
  } catch {
    // sessionStorage full or unavailable — degrade silently
  }
}

export function loadBrowseContext(key = STORAGE_KEY): BrowseContext | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as BrowseContext;
  } catch {
    return null;
  }
}

export function clearBrowseContext(key = STORAGE_KEY): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getBrowseNav(entityId: string, key = STORAGE_KEY): BrowseNav | null {
  const ctx = loadBrowseContext(key);
  if (!ctx) return null;

  const index = ctx.ids.indexOf(entityId);
  if (index === -1) return null;

  const isLastLoaded = index === ctx.ids.length - 1;
  const hasMore = ctx.nextCursor !== null;

  return {
    index,
    total: ctx.totalCount,
    loaded: ctx.ids.length,
    prevId: index > 0 ? ctx.ids[index - 1] : null,
    prevName: index > 0 ? ctx.names[index - 1] : null,
    nextId: index < ctx.ids.length - 1 ? ctx.ids[index + 1] : null,
    nextName: index < ctx.ids.length - 1 ? ctx.names[index + 1] : null,
    isAtEnd: isLastLoaded && hasMore,
  };
}

export function extendBrowseContext(
  newIds: string[],
  newNames: string[],
  newCursor: string | null,
  key = STORAGE_KEY,
): void {
  const ctx = loadBrowseContext(key);
  if (!ctx) return;

  ctx.ids.push(...newIds);
  ctx.names.push(...newNames);
  ctx.nextCursor = newCursor;
  saveBrowseContext(ctx, key);
}

export function updateBrowseScrollY(scrollY: number, key = STORAGE_KEY): void {
  const ctx = loadBrowseContext(key);
  if (!ctx) return;

  ctx.scrollY = scrollY;
  saveBrowseContext(ctx, key);
}

/** Build the return URL for a browse list, restoring filters + loaded count */
export function getBrowseReturnUrl(basePath = "/people", key = STORAGE_KEY): string {
  const ctx = loadBrowseContext(key);
  if (!ctx) return basePath;

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(ctx.filters)) {
    if (v) params.set(k, v);
  }
  if (ctx.ids.length > 50) {
    params.set("loaded", String(ctx.ids.length));
  }
  if (ctx.slot) {
    params.set("slot", String(ctx.slot));
  }

  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Truncate a name for storage/display (max 20 chars) */
export function truncateName(name: string, max = 20): string {
  return name.length > max ? name.slice(0, max - 1) + "…" : name;
}

/** Build a filter key string for comparison */
export function serializeFilters(params: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") {
      result[k] = v;
    }
  }
  return result;
}

/** Check if two filter objects are equivalent */
export function filtersMatch(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k, i) => k === keysB[i] && a[k] === b[k]);
}
