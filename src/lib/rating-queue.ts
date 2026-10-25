// The rating queue's URL (2026-10-25) — pure, for the server page and the
// client bar alike. `rate=` holds the list it walks: `sessions?<its query>` or
// `sets?<its query>`.

export type ListParams = Record<string, string | undefined>;

/** A session in the queue, keeping the queue */
export function rateHref(sessionId: string, rate: string): string {
  return `/sessions/${sessionId}?rate=${encodeURIComponent(rate)}`;
}

/** The queue's first session — /sessions/rate finds it */
export function rateStartHref(from: "sessions" | "sets", query: string): string {
  return `/sessions/rate?rate=${encodeURIComponent(query ? `${from}?${query}` : from)}`;
}

/** `sessions?…` or `sets?…` — the list a queue walks; anything else is no queue */
export function parseRateParam(rate: string | undefined): { from: "sessions" | "sets"; params: ListParams; query: string } | null {
  if (!rate) return null;
  const at = rate.indexOf("?");
  const from = at < 0 ? rate : rate.slice(0, at);
  if (from !== "sessions" && from !== "sets") return null;
  const query = at < 0 ? "" : rate.slice(at + 1);
  const search = new URLSearchParams(query);
  // Paging and grouping do not change what is in the list
  for (const k of ["loaded", "groupBy"]) search.delete(k);
  return { from, params: Object.fromEntries(search), query: search.toString() };
}
