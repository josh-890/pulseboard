const KEYS = {
  people: "pulseboard-starred-people",
  sets: "pulseboard-starred-sets",
  sessions: "pulseboard-starred-sessions",
} as const;

export type StarEntity = keyof typeof KEYS;

export function getStarred(entity: StarEntity): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEYS[entity]) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function toggleStar(entity: StarEntity, id: string): boolean {
  const stored = getStarred(entity);
  const isNowStarred = !stored.includes(id);
  const updated = isNowStarred
    ? [id, ...stored]
    : stored.filter((x) => x !== id);
  localStorage.setItem(KEYS[entity], JSON.stringify(updated));
  return isNowStarred;
}
