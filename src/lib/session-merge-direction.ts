/**
 * Which session survives a merge (2026-10-18): the older one. Each set used to
 * get its own session; merging says two sets came from one shoot, and that
 * shoot is the earliest. Decided by the session date, then — when a date is
 * missing or the same — by the earliest release of its sets, then by when the
 * session was created. A level only decides when both sides have it and differ.
 */

export type MergeDirectionFacts = {
  id: string;
  date: Date | string | null;
  earliestRelease: Date | string | null;
  createdAt: Date | string;
};

export type MergeDirectionReason = "date" | "set-release" | "created";

export type MergeDirection = { survivorId: string; absorbedId: string; reason: MergeDirectionReason };

function time(value: Date | string | null): number | null {
  if (value === null) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

export function resolveMergeDirection(a: MergeDirectionFacts, b: MergeDirectionFacts): MergeDirection {
  const levels: [MergeDirectionReason, (f: MergeDirectionFacts) => number | null][] = [
    ["date", (f) => time(f.date)],
    ["set-release", (f) => time(f.earliestRelease)],
    ["created", (f) => time(f.createdAt)],
  ];
  for (const [reason, key] of levels) {
    const ta = key(a);
    const tb = key(b);
    if (ta === null || tb === null || ta === tb) continue;
    return ta < tb
      ? { survivorId: a.id, absorbedId: b.id, reason }
      : { survivorId: b.id, absorbedId: a.id, reason };
  }
  // Indistinguishable: keep the one the user started from
  return { survivorId: a.id, absorbedId: b.id, reason: "created" };
}
