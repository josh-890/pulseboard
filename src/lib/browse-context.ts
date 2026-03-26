/**
 * Client-side browse context for prev/next navigation on person detail pages.
 * Uses sessionStorage to persist ordered ID list, display names, scroll position,
 * and pagination cursor across page navigations.
 */

const STORAGE_KEY = "pulseboard-browse-context";

export type BrowseContext = {
  /** Ordered list of person IDs in the current browse subset */
  ids: string[];
  /** Parallel array of display names (truncated) for prev/next preview */
  names: string[];
  /** Cursor for loading next batch (null = no more) */
  nextCursor: string | null;
  /** Total count of the full subset */
  totalCount: number;
  /** Filter snapshot — used to detect stale context on browser return */
  filters: Record<string, string>;
  /** Headshot slot filter value */
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

export function saveBrowseContext(ctx: BrowseContext): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    // sessionStorage full or unavailable — degrade silently
  }
}

export function loadBrowseContext(): BrowseContext | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BrowseContext;
  } catch {
    return null;
  }
}

export function clearBrowseContext(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getBrowseNav(personId: string): BrowseNav | null {
  const ctx = loadBrowseContext();
  if (!ctx) return null;

  const index = ctx.ids.indexOf(personId);
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
): void {
  const ctx = loadBrowseContext();
  if (!ctx) return;

  ctx.ids.push(...newIds);
  ctx.names.push(...newNames);
  ctx.nextCursor = newCursor;
  saveBrowseContext(ctx);
}

export function updateBrowseScrollY(scrollY: number): void {
  const ctx = loadBrowseContext();
  if (!ctx) return;

  ctx.scrollY = scrollY;
  saveBrowseContext(ctx);
}

/** Build the /people URL that restores the stored browse state (filters + loaded count) */
export function getBrowseReturnUrl(): string {
  const ctx = loadBrowseContext();
  if (!ctx) return "/people";

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
  return qs ? `/people?${qs}` : "/people";
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
