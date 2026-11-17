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
 * "c" after any non-alphanumeric separator — "Title-c.jpg" and "Title - c.jpg"
 * are both in real use. Case-insensitive.
 */
const COVER_FILENAME = /(^|[^a-z0-9])c\.(jpe?g|png|webp)$/i;

export function isCoverArtFilename(filename: string): boolean {
  return COVER_FILENAME.test(filename);
}
