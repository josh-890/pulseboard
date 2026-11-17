/**
 * Which cover a session shows (ADR-0040): its own pick (a cover set in the
 * session grid), else the cover of the set released first among those it is
 * the primary session of (then the one created first), else its first photo —
 * that last step is the server's (`getCoverPhotosForSessions`).
 */

export type SessionCoverSet = {
  id: string;
  title: string;
  coverMediaItemId: string | null;
  isPrimary: boolean;
  releaseDate: Date | string | null;
  createdAt: Date | string;
};

const time = (d: Date | string | null) => (d === null ? Infinity : new Date(d).getTime());

/** The session's sets in cover order: primary first, then by release, then by creation */
export function sessionSetsInCoverOrder<T extends SessionCoverSet>(sets: readonly T[]): T[] {
  return [...sets].sort(
    (a, b) =>
      Number(b.isPrimary) - Number(a.isPrimary) ||
      time(a.releaseDate) - time(b.releaseDate) ||
      time(a.createdAt) - time(b.createdAt),
  );
}

export type SessionCoverSource =
  | { kind: "own"; mediaItemId: string }
  | { kind: "set"; mediaItemId: string; set: SessionCoverSet }
  | { kind: "none" };

/** Where the session's cover comes from */
export function sessionCoverSource(ownCoverId: string | null, sets: readonly SessionCoverSet[]): SessionCoverSource {
  if (ownCoverId) return { kind: "own", mediaItemId: ownCoverId };
  const set = sessionSetsInCoverOrder(sets).find((s) => s.isPrimary && s.coverMediaItemId);
  return set ? { kind: "set", mediaItemId: set.coverMediaItemId!, set } : { kind: "none" };
}
