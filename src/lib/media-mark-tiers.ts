// The photo marks are tiers (2026-10-17): outtake < ★ favorite < iconic. Setting
// a mark sets every lower one — an iconic photo is also a favorite and an outtake —
// and clearing a mark clears every higher one — no longer an outtake means no
// longer a favorite or iconic either. One rule for the server (which enforces it
// wherever a mark changes) and the screens (which show it at once).

export type MarkKey = "iconic" | "favorite" | "outtake";

/** Lowest first */
export const MARK_TIERS: readonly MarkKey[] = ["outtake", "favorite", "iconic"];

/** Every mark a change sets or clears — the changed one included */
export function markCascade(key: MarkKey, on: boolean): Partial<Record<MarkKey, boolean>> {
  const i = MARK_TIERS.indexOf(key);
  const affected = on ? MARK_TIERS.slice(0, i + 1) : MARK_TIERS.slice(i);
  return Object.fromEntries(affected.map((k) => [k, on]));
}
