import { prisma } from "@/lib/db";
import { PHOTO_WHERE } from "@/lib/media-role";
import { buildPhotoUrls } from "@/lib/media-url";
import { parsePhotoVariants } from "@/lib/types";
import { MAX_EXAMPLES, type Crop, type TagExampleThumb } from "@/lib/tag-example";

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

export type TagCardExample = { id: string; mediaItemId: string; url: string; crop: Crop; isTitle: boolean };

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
        select: { id: true, mediaItemId: true, isTitle: true, cropX: true, cropY: true, cropW: true, cropH: true, mediaItem: { select: { variants: true, fileRef: true } } },
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
    return viewUrl ? [{ id: e.id, mediaItemId: e.mediaItemId, url: viewUrl, crop: cropOf(e), isTitle: e.isTitle }] : [];
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

const validCrop = (c: Crop) =>
  [c.x, c.y, c.w, c.h].every((v) => Number.isFinite(v)) && c.w > 0 && c.h > 0 && c.x >= 0 && c.y >= 0 && c.x + c.w <= 1.0001 && c.y + c.h <= 1.0001;

/**
 * Add a photo as an example (or re-crop it if it is one already). The first
 * example becomes the title. Refused beyond five.
 */
export async function addTagExample(tagId: string, mediaItemId: string, crop: Crop): Promise<void> {
  if (!validCrop(crop)) throw new Error("That crop is outside the photo");
  const data = { cropX: crop.x, cropY: crop.y, cropW: crop.w, cropH: crop.h };
  await prisma.$transaction(async (tx) => {
    const existing = await tx.tagExample.findUnique({ where: { tagId_mediaItemId: { tagId, mediaItemId } } });
    if (existing) return void (await tx.tagExample.update({ where: { id: existing.id }, data }));
    const count = await tx.tagExample.count({ where: { tagId } });
    if (count >= MAX_EXAMPLES) throw new Error(`A tag has at most ${MAX_EXAMPLES} examples — remove one first`);
    await tx.tagExample.create({ data: { tagId, mediaItemId, ...data, isTitle: count === 0, sortOrder: count } });
  });
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
