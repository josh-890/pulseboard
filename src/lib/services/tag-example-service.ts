import { prisma } from "@/lib/db";
import { PHOTO_WHERE } from "@/lib/media-role";
import { buildPhotoUrls } from "@/lib/media-url";
import { parsePhotoVariants } from "@/lib/types";
import {
  aspectOf,
  cropFromBox,
  DEFAULT_FRAMING,
  FRAMING,
  MAX_EXAMPLES,
  type Box,
  type Crop,
  type Framing,
  type TagExampleThumb,
} from "@/lib/tag-example";

// Tag examples (ADR-0042, S4): the user's own photos, cropped, as a tag's tile
// and in its card — one title example and up to four more. Proposals are photos
// already carrying the tag.

type VariantRow = { variants: unknown; fileRef: string | null };

function urlsOf(m: VariantRow) {
  const u = buildPhotoUrls(parsePhotoVariants(m.variants) ?? {}, m.fileRef);
  return {
    thumbUrl: u.gallery_512 ?? u.view_1200 ?? (u.original || null),
    viewUrl: u.view_1200 ?? u.full_2400 ?? (u.original || null),
  };
}

const cropOf = (e: { cropX: number; cropY: number; cropW: number; cropH: number }): Crop => ({
  x: e.cropX,
  y: e.cropY,
  w: e.cropW,
  h: e.cropH,
});

/** tag id → its title example, for the tiles */
export async function getTitleExamples(tagIds: string[]): Promise<Record<string, TagExampleThumb>> {
  if (tagIds.length === 0) return {};
  const rows = await prisma.tagExample.findMany({
    where: { tagId: { in: tagIds }, isTitle: true },
    select: { tagId: true, cropX: true, cropY: true, cropW: true, cropH: true, mediaItem: { select: { variants: true, fileRef: true } } },
  });
  const out: Record<string, TagExampleThumb> = {};
  for (const r of rows) {
    const { thumbUrl } = urlsOf(r.mediaItem);
    if (thumbUrl) out[r.tagId] = { url: thumbUrl, crop: cropOf(r) };
  }
  return out;
}

export type TagCardExample = {
  id: string;
  mediaItemId: string;
  url: string;
  crop: Crop;
  /** The subject box it was framed from (null for an older free crop) */
  box: Box | null;
  width: number;
  height: number;
  isTitle: boolean;
};

export type TagCardProposal = { mediaItemId: string; thumbUrl: string; viewUrl: string; width: number; height: number };

export type TagCard = {
  id: string;
  name: string;
  description: string | null;
  /** Spellings that find it — Danbooru's among them */
  aliases: string[];
  examples: TagCardExample[];
  confusables: { id: string; name: string; description: string | null; example: TagExampleThumb | null }[];
  /** Photos with the tag that are not examples yet (only while there is room) */
  proposals: TagCardProposal[];
};

/** Everything the tag's card shows */
export async function getTagCard(tagId: string): Promise<TagCard | null> {
  const tag = await prisma.tagDefinition.findUnique({
    where: { id: tagId },
    select: {
      id: true,
      name: true,
      description: true,
      aliases: { select: { name: true } },
      examples: {
        orderBy: [{ isTitle: "desc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          mediaItemId: true,
          isTitle: true,
          cropX: true,
          cropY: true,
          cropW: true,
          cropH: true,
          boxX: true,
          boxY: true,
          boxW: true,
          boxH: true,
          mediaItem: { select: { variants: true, fileRef: true, originalWidth: true, originalHeight: true } },
        },
      },
      confusables: { select: { tagB: { select: { id: true, name: true, description: true } } } },
      confusedBy: { select: { tagA: { select: { id: true, name: true, description: true } } } },
    },
  });
  if (!tag) return null;

  const others = [...tag.confusables.map((c) => c.tagB), ...tag.confusedBy.map((c) => c.tagA)];
  const otherTitles = await getTitleExamples(others.map((o) => o.id));
  const examples: TagCardExample[] = tag.examples.flatMap((e) => {
    const { viewUrl } = urlsOf(e.mediaItem);
    const box = e.boxX !== null && e.boxY !== null && e.boxW !== null && e.boxH !== null ? { x: e.boxX, y: e.boxY, w: e.boxW, h: e.boxH } : null;
    return viewUrl
      ? [{ id: e.id, mediaItemId: e.mediaItemId, url: viewUrl, crop: cropOf(e), box, width: e.mediaItem.originalWidth, height: e.mediaItem.originalHeight, isTitle: e.isTitle }]
      : [];
  });

  let proposals: TagCardProposal[] = [];
  if (examples.length < MAX_EXAMPLES) {
    const rows = await prisma.mediaItem.findMany({
      where: {
        mediaType: "PHOTO",
        ...PHOTO_WHERE,
        mediaItemTags: { some: { tagDefinitionId: tagId } },
        tagExamples: { none: { tagId } },
      },
      orderBy: [{ isFavorite: "desc" }, { createdAt: "desc" }],
      take: 6,
      select: { id: true, variants: true, fileRef: true, originalWidth: true, originalHeight: true },
    });
    proposals = rows.flatMap((r) => {
      const { thumbUrl, viewUrl } = urlsOf(r);
      return thumbUrl && viewUrl
        ? [{ mediaItemId: r.id, thumbUrl, viewUrl, width: r.originalWidth, height: r.originalHeight }]
        : [];
    });
  }

  return {
    id: tag.id,
    name: tag.name,
    description: tag.description,
    aliases: tag.aliases.map((a) => a.name),
    examples,
    confusables: others.map((o) => ({ ...o, example: otherTitles[o.id] ?? null })),
    proposals,
  };
}

const validBox = (b: Box) =>
  [b.x, b.y, b.w, b.h].every((v) => Number.isFinite(v)) && b.w >= 0.01 && b.h >= 0.01 && b.x >= 0 && b.y >= 0 && b.x + b.w <= 1.0001 && b.y + b.h <= 1.0001;

/** The tile shape and framing rule of the Composer path that shows a tag (square, default rule otherwise) */
async function framingOfTag(tagId: string): Promise<{ tileAspect: number; framing: Framing }> {
  const tag = await prisma.tagDefinition.findUniqueOrThrow({ where: { id: tagId }, select: { groupId: true } });
  const link = await prisma.composerSectionGroup.findFirst({
    where: { groupId: tag.groupId },
    select: { section: { select: { path: { select: { name: true, tileAspect: true } } } } },
  });
  const path = link?.section.path;
  return { tileAspect: aspectOf(path?.tileAspect ?? "1:1"), framing: (path && FRAMING[path.name]) || DEFAULT_FRAMING };
}

/**
 * Add a photo as an example (or re-frame it if it is one already) from a box
 * around the subject: the path's framing rule makes the crop (ADR-0042, S4).
 * The first example becomes the title. Refused beyond five.
 */
export async function addTagExample(tagId: string, mediaItemId: string, box: Box): Promise<void> {
  if (!validBox(box)) throw new Error("Draw a box around the subject inside the photo");
  const photo = await prisma.mediaItem.findUniqueOrThrow({ where: { id: mediaItemId }, select: { originalWidth: true, originalHeight: true } });
  const { tileAspect, framing } = await framingOfTag(tagId);
  const crop = cropFromBox(box, photo.originalWidth / Math.max(1, photo.originalHeight), tileAspect, framing);
  const data = { cropX: crop.x, cropY: crop.y, cropW: crop.w, cropH: crop.h, boxX: box.x, boxY: box.y, boxW: box.w, boxH: box.h };
  await prisma.$transaction(async (tx) => {
    const existing = await tx.tagExample.findUnique({ where: { tagId_mediaItemId: { tagId, mediaItemId } } });
    if (existing) return void (await tx.tagExample.update({ where: { id: existing.id }, data }));
    const count = await tx.tagExample.count({ where: { tagId } });
    if (count >= MAX_EXAMPLES) throw new Error(`A tag has at most ${MAX_EXAMPLES} examples — remove one first`);
    await tx.tagExample.create({ data: { tagId, mediaItemId, ...data, isTitle: count === 0, sortOrder: count } });
  });
}

/**
 * Re-frame every example that has a subject box under today's rules — after a
 * framing rule or a path's tile shape changed. Returns how many were updated.
 */
export async function reframeTagExamples(): Promise<number> {
  const rows = await prisma.tagExample.findMany({
    where: { boxX: { not: null }, boxY: { not: null }, boxW: { not: null }, boxH: { not: null } },
    select: { id: true, tagId: true, boxX: true, boxY: true, boxW: true, boxH: true, mediaItem: { select: { originalWidth: true, originalHeight: true } } },
  });
  const rules = new Map<string, { tileAspect: number; framing: Framing }>();
  let n = 0;
  for (const r of rows) {
    if (!rules.has(r.tagId)) rules.set(r.tagId, await framingOfTag(r.tagId));
    const { tileAspect, framing } = rules.get(r.tagId)!;
    const crop = cropFromBox({ x: r.boxX!, y: r.boxY!, w: r.boxW!, h: r.boxH! }, r.mediaItem.originalWidth / Math.max(1, r.mediaItem.originalHeight), tileAspect, framing);
    await prisma.tagExample.update({ where: { id: r.id }, data: { cropX: crop.x, cropY: crop.y, cropW: crop.w, cropH: crop.h } });
    n++;
  }
  return n;
}

/** Make an example the tag's title (its tile) */
export async function setTitleExample(exampleId: string): Promise<void> {
  const ex = await prisma.tagExample.findUniqueOrThrow({ where: { id: exampleId }, select: { tagId: true } });
  await prisma.$transaction([
    prisma.tagExample.updateMany({ where: { tagId: ex.tagId }, data: { isTitle: false } }),
    prisma.tagExample.update({ where: { id: exampleId }, data: { isTitle: true } }),
  ]);
}

/** Remove an example; when it was the title, the next one takes over */
export async function removeTagExample(exampleId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const ex = await tx.tagExample.delete({ where: { id: exampleId }, select: { tagId: true, isTitle: true } });
    if (!ex.isTitle) return;
    const next = await tx.tagExample.findFirst({ where: { tagId: ex.tagId }, orderBy: { sortOrder: "asc" } });
    if (next) await tx.tagExample.update({ where: { id: next.id }, data: { isTitle: true } });
  });
}
