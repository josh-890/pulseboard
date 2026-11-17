import { prisma } from "@/lib/db";
import type { PhotoVariants } from "@/lib/types";
import { hammingDistance } from "@/lib/image-hash";
import { cascadeHardDeleteMediaItems, type TxClient } from "./cascade-helpers";

/**
 * Cover art (ADR-0040): redundant copies.
 *
 * A cover-art file that is a copy of another file of its set — the 512px archive
 * stand-in once the real picture is in, or the smaller of two identical publisher
 * covers (`cover.jpg` and `Title-c.jpg`) — adds nothing. On xpulse the dHash of
 * such a copy sits 0–6 bits from its original; different photographs start well
 * above that (ADR-0031 measured 14–19), and a cropped or lettered variant lands
 * in between — those are left alone.
 */
export const ART_COPY_MAX_BITS = 6;

type Candidate = { id: string; phash: string | null; originalWidth: number; originalHeight: number };

const pixels = (m: { originalWidth: number; originalHeight: number }) => m.originalWidth * m.originalHeight;

/**
 * The art files of `others` that `kept` makes redundant: a near-identical
 * picture with no more pixels than it. Pure — the arrival path and the cleanup
 * page share it.
 */
export function redundantArtCopies(kept: Candidate, others: readonly Candidate[]): string[] {
  if (!kept.phash) return [];
  return others
    .filter(
      (o) =>
        o.id !== kept.id &&
        o.phash !== null &&
        hammingDistance(kept.phash!, o.phash) <= ART_COPY_MAX_BITS &&
        pixels(o) <= pixels(kept),
    )
    .map((o) => o.id);
}

/**
 * A file has just arrived in a set: delete the set's art files it makes
 * redundant — any art copy when the new file is art too (keep the larger), only
 * the transferred stand-ins when it is a photo (a `Title-c.jpg` that is a crop
 * of a set photo is the publisher's cover and stays). The covers they held
 * (set and session pointers) move to the new file. Never deletes the new file
 * and never a photo. Returns the deleted files' variants for MinIO cleanup
 * after the commit.
 */
export async function absorbRedundantArt(
  tx: TxClient,
  setId: string,
  arrived: Candidate & { isArt: boolean },
): Promise<PhotoVariants[]> {
  if (!arrived.phash) return [];
  const art = await tx.mediaItem.findMany({
    where: {
      role: "COVER_ART",
      setMediaItems: { some: { setId } },
      id: { not: arrived.id },
      phash: { not: null },
      ...(arrived.isArt ? {} : { isTransferredCover: true }),
    },
    select: { id: true, phash: true, originalWidth: true, originalHeight: true },
  });
  const redundant = redundantArtCopies(arrived, art);
  if (redundant.length === 0) return [];
  await tx.set.updateMany({
    where: { coverMediaItemId: { in: redundant } },
    data: { coverMediaItemId: arrived.id, coverIsProvisional: false },
  });
  await tx.session.updateMany({
    where: { coverMediaItemId: { in: redundant } },
    data: { coverMediaItemId: arrived.id },
  });
  return cascadeHardDeleteMediaItems(tx, redundant);
}

/** Delete MinIO files of removed items, best effort; orphan keys are queued for retry. */
export async function cleanupDeletedFiles(variantsList: PhotoVariants[]): Promise<void> {
  if (variantsList.length === 0) return;
  try {
    const { deleteMediaFiles } = await import("@/lib/media-upload");
    await deleteMediaFiles(variantsList);
  } catch (err) {
    console.error("[cover-art] MinIO cleanup failed:", err);
    await prisma.orphanedStorageKey
      .createMany({
        data: variantsList.flatMap((v) =>
          Object.values(v)
            .filter((k): k is string => typeof k === "string" && k.length > 0)
            .map((key) => ({ key, reason: "delete_cleanup_failed" })),
        ),
      })
      .catch(() => {});
  }
}

/** Where a change to these files shows: their sets and sessions (for revalidation). */
export async function placesOfMedia(ids: string[]): Promise<{ setIds: string[]; sessionIds: string[] }> {
  const items = await prisma.mediaItem.findMany({
    where: { id: { in: ids } },
    select: { sessionId: true, setMediaItems: { select: { setId: true } } },
  });
  return {
    setIds: [...new Set(items.flatMap((i) => i.setMediaItems.map((s) => s.setId)))],
    sessionIds: [...new Set(items.map((i) => i.sessionId))],
  };
}

/**
 * Cover art ⇄ photo ("This is cover art" / "Not cover art"). Either way the file
 * leaves the both-state: a new art file starts outside the photos. Being the
 * cover is untouched.
 */
export async function setMediaRole(ids: string[], role: "PHOTO" | "COVER_ART"): Promise<number> {
  if (ids.length === 0) return 0;
  const r = await prisma.mediaItem.updateMany({
    where: { id: { in: ids }, mediaType: "PHOTO" },
    data: { role, artInPhotos: false },
  });
  return r.count;
}

/** "+ add to photos": cover art that also counts as a photo (and back). */
export async function setArtInPhotos(id: string, on: boolean): Promise<void> {
  await prisma.mediaItem.updateMany({ where: { id, role: "COVER_ART" }, data: { artInPhotos: on } });
}
