import { prisma } from "@/lib/db";
import { buildUrl } from "@/lib/media-url";
import { COVER_RANK, coverRank, type MediaRoleValue } from "@/lib/media-role";
import type { PhotoVariants } from "@/lib/types";

/**
 * The cover check (ADR-0040 addendum, 2026-11-19): sets whose automatic cover is
 * not the best cover art they hold — a `Title-c1` or a photo that won the race
 * of parallel uploads, the cover carried over at promotion while the archive's
 * `Title-c` is there. A cover picked by hand is never listed.
 *
 * variant — the cover is a `Title-cN` while a better-ranked `Title-c(N)` is there;
 * import — the cover carried over at promotion (a different picture);
 * sameUpload — a photo that arrived with the cover art (within two minutes);
 * photo — a photo from another upload: maybe picked by hand before the set
 *   remembered picks — listed, not pre-selected.
 */
export type CoverCheckKind = "variant" | "import" | "sameUpload" | "photo";

export type CoverCheckFile = { id: string; filename: string; width: number; height: number; thumbUrl: string | null };

export type CoverCheckRow = {
  kind: CoverCheckKind;
  setId: string;
  setTitle: string;
  current: CoverCheckFile | null;
  best: CoverCheckFile;
};

const SAME_UPLOAD_MS = 2 * 60 * 1000;

type FileRow = {
  id: string;
  filename: string;
  role: MediaRoleValue;
  originalWidth: number;
  originalHeight: number;
  variants: unknown;
  createdAt: Date;
};

const thumb = (variants: unknown): string | null => {
  const v = (variants ?? {}) as PhotoVariants;
  const key = v.gallery_512 ?? v.master_4000 ?? v.original;
  return key ? buildUrl(key) : null;
};

const file = (f: FileRow): CoverCheckFile => ({
  id: f.id,
  filename: f.filename,
  width: f.originalWidth,
  height: f.originalHeight,
  thumbUrl: thumb(f.variants),
});

/** Which kind of row — or null when the cover is already the best one */
export function coverCheckKind(
  current: { filename: string; role: MediaRoleValue; createdAt: Date } | null,
  best: { filename: string; role: MediaRoleValue; createdAt: Date },
): CoverCheckKind | null {
  const bestRank = coverRank(best);
  if (!current) return "sameUpload";
  const currentRank = coverRank(current);
  if (bestRank >= currentRank) return null;
  if (currentRank < COVER_RANK.otherArt) return "variant";
  if (currentRank < COVER_RANK.photo) return "import";
  return Math.abs(current.createdAt.getTime() - best.createdAt.getTime()) <= SAME_UPLOAD_MS ? "sameUpload" : "photo";
}

const FILE_SELECT = {
  id: true,
  filename: true,
  role: true,
  originalWidth: true,
  originalHeight: true,
  variants: true,
  createdAt: true,
} as const;

export async function findCoverCheck(onlySetIds?: string[]): Promise<CoverCheckRow[]> {
  const sets = await prisma.set.findMany({
    where: {
      coverIsChosen: false,
      ...(onlySetIds ? { id: { in: onlySetIds } } : {}),
      setMediaItems: { some: { mediaItem: { role: "COVER_ART", mediaType: "PHOTO" } } },
    },
    select: {
      id: true,
      title: true,
      coverMediaItem: { select: FILE_SELECT },
      setMediaItems: {
        where: { mediaItem: { role: "COVER_ART", mediaType: "PHOTO" } },
        select: { mediaItem: { select: FILE_SELECT } },
      },
    },
  });

  const rows: CoverCheckRow[] = [];
  for (const s of sets) {
    // Only a file named by the cover rule is proposed — never the 512px stand-in over a photo
    const named = s.setMediaItems
      .map((x) => x.mediaItem as FileRow)
      .filter((f) => coverRank(f) < COVER_RANK.otherArt)
      .sort((a, b) => coverRank(a) - coverRank(b) || a.filename.localeCompare(b.filename));
    const best = named[0];
    if (!best) continue;
    const current = (s.coverMediaItem as FileRow | null) ?? null;
    const kind = coverCheckKind(current, best);
    if (!kind) continue;
    rows.push({ kind, setId: s.id, setTitle: s.title, current: current ? file(current) : null, best: file(best) });
  }
  return rows.sort((a, b) => a.setTitle.localeCompare(b.setTitle));
}

/**
 * Switch the listed sets to their best cover art (rechecked first), and let the
 * kept ones keep their cover for good — they count as picked by hand from now on.
 */
export async function applyCoverCheck(switchSetIds: string[], keepSetIds: string[]): Promise<{ switched: number; kept: number }> {
  const current = switchSetIds.length > 0 ? await findCoverCheck(switchSetIds) : [];
  await prisma.$transaction(async (tx) => {
    for (const r of current) {
      await tx.set.update({
        where: { id: r.setId },
        data: { coverMediaItemId: r.best.id, coverIsProvisional: false, coverIsChosen: false },
      });
    }
    if (keepSetIds.length > 0) {
      await tx.set.updateMany({ where: { id: { in: keepSetIds } }, data: { coverIsChosen: true } });
    }
  });
  return { switched: current.length, kept: keepSetIds.length };
}
