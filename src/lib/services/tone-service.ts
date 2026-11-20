import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { photoSql } from "@/lib/media-role";
import { buildUrl } from "@/lib/media-url";
import {
  TONE_BORDER,
  TONE_THRESHOLD,
  toneBucketOf,
  toneOf,
  type ToneBucket,
  type ToneCounts,
  type ToneValue,
} from "@/lib/tone";
import type { PhotoVariants } from "@/lib/types";

/**
 * Color / B&W per set (ADR-0041), counted live over the set's measured photos —
 * cover art and videos never count. One grouped query; at tens of thousands of
 * photos it is cheap, the same way cast counts are (setIdsByCastCounts).
 */
async function setToneRows(setIds?: string[]): Promise<{ setId: string; mono: number; total: number }[]> {
  if (setIds && setIds.length === 0) return [];
  const only = setIds ? Prisma.sql`AND smi."setId" IN (${Prisma.join(setIds)})` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ setId: string; mono: bigint; total: bigint }[]>`
    SELECT smi."setId",
           count(*) FILTER (WHERE mi.tone = 'MONO') AS mono,
           count(*) AS total
      FROM "SetMediaItem" smi
      JOIN "MediaItem" mi ON mi.id = smi."mediaItemId"
     WHERE mi."mediaType" = 'PHOTO' AND ${photoSql("mi")} AND mi.tone IS NOT NULL ${only}
     GROUP BY smi."setId"`;
  return rows.map((r) => ({ setId: r.setId, mono: Number(r.mono), total: Number(r.total) }));
}

/** Set ids in any of the buckets */
export async function setIdsByTone(buckets: ToneBucket[]): Promise<string[]> {
  const want = new Set(buckets);
  return (await setToneRows())
    .filter((r) => {
      const b = toneBucketOf(r);
      return b !== null && want.has(b);
    })
    .map((r) => r.setId);
}

/** Every measured set's bucket — for facet counts */
export async function setIdsPerToneBucket(): Promise<Record<ToneBucket, string[]>> {
  const out: Record<ToneBucket, string[]> = { color: [], mono: [], mixed: [] };
  for (const r of await setToneRows()) {
    const b = toneBucketOf(r);
    if (b) out[b].push(r.setId);
  }
  return out;
}

/** B&W and measured photo counts for the given sets (the card badge) */
export async function getToneCountsForSets(setIds: string[]): Promise<Map<string, ToneCounts>> {
  const m = new Map<string, ToneCounts>();
  for (const r of await setToneRows(setIds)) m.set(r.setId, { mono: r.mono, total: r.total });
  return m;
}

/**
 * Set the tone by hand (it wins over the measurement from then on), or with
 * `null` hand it back to the measurement.
 */
export async function setMediaTone(mediaItemIds: string[], tone: ToneValue | null): Promise<void> {
  if (mediaItemIds.length === 0) return;
  if (tone) {
    await prisma.mediaItem.updateMany({ where: { id: { in: mediaItemIds } }, data: { tone, toneIsManual: true } });
    return;
  }
  const items = await prisma.mediaItem.findMany({ where: { id: { in: mediaItemIds } }, select: { id: true, chroma: true } });
  await prisma.$transaction(
    items.map((it) =>
      prisma.mediaItem.update({
        where: { id: it.id },
        data: { tone: it.chroma === null ? null : toneOf(it.chroma), toneIsManual: false },
      }),
    ),
  );
}

export type ToneCheckItem = {
  id: string;
  filename: string;
  chroma: number;
  tone: ToneValue;
  thumbUrl: string | null;
  setId: string | null;
  setTitle: string | null;
};

/**
 * Photos near the threshold that nobody has looked at yet — the tone check
 * (Settings → System). Nearest the threshold first.
 */
export async function findToneCheck(limit = 200): Promise<{ items: ToneCheckItem[]; total: number }> {
  const where = {
    mediaType: "PHOTO" as const,
    toneIsManual: false,
    chroma: { gte: TONE_BORDER[0], lte: TONE_BORDER[1] },
  };
  const [total, rows] = await Promise.all([
    prisma.mediaItem.count({ where }),
    prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "MediaItem"
       WHERE "mediaType" = 'PHOTO' AND NOT "toneIsManual"
         AND chroma BETWEEN ${TONE_BORDER[0]} AND ${TONE_BORDER[1]}
       ORDER BY abs(chroma - ${TONE_THRESHOLD}), id
       LIMIT ${limit}`,
  ]);
  const ids = rows.map((r) => r.id);
  const items = await prisma.mediaItem.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      filename: true,
      chroma: true,
      tone: true,
      variants: true,
      setMediaItems: { take: 1, select: { set: { select: { id: true, title: true } } } },
    },
  });
  const order = new Map(ids.map((id, i) => [id, i]));
  return {
    total,
    items: items
      .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
      .map((it) => {
        const v = (it.variants ?? {}) as PhotoVariants;
        const key = v.gallery_512 ?? v.view_1200 ?? v.master_4000 ?? v.original;
        const set = it.setMediaItems[0]?.set ?? null;
        return {
          id: it.id,
          filename: it.filename,
          chroma: it.chroma ?? 0,
          tone: it.tone ?? toneOf(it.chroma ?? 0),
          thumbUrl: key ? buildUrl(key) : null,
          setId: set?.id ?? null,
          setTitle: set?.title ?? null,
        };
      }),
  };
}

/** The tone check's decisions — every photo decided, each on its own */
export async function applyToneCheck(decisions: { id: string; tone: ToneValue }[]): Promise<number> {
  const mono = decisions.filter((d) => d.tone === "MONO").map((d) => d.id);
  const color = decisions.filter((d) => d.tone === "COLOR").map((d) => d.id);
  await prisma.$transaction([
    prisma.mediaItem.updateMany({ where: { id: { in: mono } }, data: { tone: "MONO", toneIsManual: true } }),
    prisma.mediaItem.updateMany({ where: { id: { in: color } }, data: { tone: "COLOR", toneIsManual: true } }),
  ]);
  return decisions.length;
}
