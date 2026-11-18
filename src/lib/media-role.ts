import { Prisma } from "@/generated/prisma/client";

/**
 * Cover art vs photo (ADR-0040).
 *
 * A file is a PHOTO or COVER_ART. Cover art — the publisher's cover — sits in
 * the cover slot of its set/session, outside the photos: grids, counts,
 * showcases, filters and pickers see photos only. `artInPhotos` lets an art file
 * in as well. Being *the* cover is a separate fact (Set/Session.coverMediaItemId)
 * and may point at either kind.
 */

export type MediaRoleValue = "PHOTO" | "COVER_ART";

export type RoleSource = { role: MediaRoleValue; artInPhotos: boolean };

/** Counts as a photo: a photo, or cover art let into the photos. */
export function isPhotoItem(item: RoleSource): boolean {
  return item.role === "PHOTO" || item.artInPhotos;
}

/** The same rule as a Prisma `MediaItemWhereInput` fragment. */
export const PHOTO_WHERE = {
  OR: [{ role: "PHOTO" as const }, { artInPhotos: true }],
} satisfies Prisma.MediaItemWhereInput;

/** The same rule as SQL, for a MediaItem alias (`mi` → `(mi.role = 'PHOTO' OR mi."artInPhotos")`). */
export function photoSql(alias: string): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`bad alias ${alias}`);
  return Prisma.raw(`(${alias}."role" = 'PHOTO' OR ${alias}."artInPhotos")`);
}

/**
 * The cover agent's rule (scripts/archive-cover.ps1): a stem ending in a lone
 * "c" — or "c1", "c2" … — after any non-alphanumeric separator. "Title-c.jpg",
 * "Title - c.jpg" and "Title - c1.jpg" are all in real use. Case-insensitive.
 */
const COVER_FILENAME = /(?:^|[^a-z0-9])c(\d*)\.(jpe?g|png|webp)$/i;

export function isCoverArtFilename(filename: string): boolean {
  return COVER_FILENAME.test(filename);
}

/** Ranks for the automatic cover — lower is better. */
export const COVER_RANK = { namedArt: 0, otherArt: 1_000, photo: 2_000 } as const;

/**
 * How good a file is as the automatic cover (ADR-0040 addendum): "Title-c" (0),
 * then "Title-c1", "-c2" … (1, 2 …) — as long as they are cover art — then any
 * other cover art (the cover carried over at promotion), then a photo. A file
 * marked "Not cover art" ranks as the photo it is, whatever its name.
 */
export function coverRank(item: { filename: string; role: MediaRoleValue }): number {
  if (item.role !== "COVER_ART") return COVER_RANK.photo;
  const m = COVER_FILENAME.exec(item.filename);
  if (!m) return COVER_RANK.otherArt;
  return m[1] ? Math.min(Number(m[1]), COVER_RANK.otherArt - 1) : COVER_RANK.namedArt;
}

export type CoverSlotState = {
  coverId: string | null;
  /** The occupant is a stand-in nobody chose (Set.coverIsProvisional) */
  provisional: boolean;
  /** Picked by hand (Set.coverIsChosen) — arrivals never replace it */
  chosen: boolean;
  cover: { filename: string; role: MediaRoleValue } | null;
};

/**
 * Does a file arriving in a set become its cover? An empty slot takes anything;
 * a stand-in arriving never displaces a cover; a real file takes a stand-in's
 * place; a cover picked by hand stays; otherwise the better-ranked file wins
 * (coverRank) — so the order files arrive in no longer matters.
 */
export function arrivalTakesCover(
  slot: CoverSlotState,
  arrival: { filename: string; role: MediaRoleValue; provisional: boolean },
): boolean {
  if (!slot.coverId) return true;
  if (arrival.provisional) return false;
  if (slot.provisional) return true;
  if (slot.chosen) return false;
  if (!slot.cover) return true;
  return coverRank(arrival) < coverRank(slot.cover);
}
