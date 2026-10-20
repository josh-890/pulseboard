/** The compare page for two sessions; `from` is where its back link returns to */
export function sessionMergeHref(aId: string, bId: string, from?: string): string {
  const params = new URLSearchParams({ a: aId, b: bId });
  if (from) params.set("from", from);
  return `/sessions/merge?${params}`;
}
