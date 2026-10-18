/**
 * Session merge (2026-10-18): what the merge dialog shows of a session — its
 * sets above all, since a session is known by what was published from it — and
 * why a candidate is suggested.
 */

export type SessionMergeSet = {
  id: string;
  title: string;
  type: "photo" | "video";
  channelName: string | null;
  releaseDate: Date | null;
  releaseDatePrecision: string;
  coverUrl: string | null;
};

export type SessionMergeCard = {
  id: string;
  name: string;
  date: Date | null;
  datePrecision: string;
  createdAt: Date;
  /** Earliest release among its sets — decides the merge direction when the date can't */
  earliestRelease: Date | null;
  labelName: string | null;
  projectName: string | null;
  sets: SessionMergeSet[];
  /** Up to 4 of its photos (gallery_512) */
  thumbUrls: string[];
  /** On camera, as `Name (ICG-ID)` */
  people: { id: string; name: string }[];
  mediaCount: number;
};

export type SessionMergeReason =
  | { kind: "people"; names: string[] }
  | { kind: "label"; name: string }
  | { kind: "project"; name: string }
  | { kind: "close"; days: number };

export type SessionMergeCandidate = SessionMergeCard & { score: number; reasons: SessionMergeReason[] };
