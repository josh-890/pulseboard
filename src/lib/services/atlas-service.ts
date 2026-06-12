/**
 * Atlas service — the AUTOMATIC cross-person comparison surface (ADR-0014).
 *
 * A locus MediaCategory bound to an Alignment Template (Eyes, a pose, …) yields a
 * grid of every person's Aligned image in that locus, side by side — comparable
 * because they share the template's framing. This is generated from the alignment
 * data (not curated like a Collection). Aligned images are identified by
 * `MediaItem.motifTemplateId` (ADR-0013), linked to the locus via a DETAIL link.
 */

import { prisma } from "@/lib/db";
import { buildUrl } from "@/lib/media-url";
import { getDisplayName } from "@/lib/utils";
import type { PhotoVariants } from "@/lib/types";

const ALIGNED_LINK_WHERE = {
  usage: "DETAIL",
  mediaItem: { motifTemplateId: { not: null } },
} as const;

function bestThumb(variants: unknown): string | null {
  const v = (variants ?? {}) as PhotoVariants;
  const key = v.gallery_512 ?? v.view_1200 ?? null;
  return key ? buildUrl(key) : null;
}

export type AtlasCategorySummary = {
  id: string;
  name: string;
  groupName: string;
  aspectW: number;
  aspectH: number;
  alignedCount: number;
  sampleThumbs: string[];
};

/** Locus categories that have an Alignment Template, with cross-person aligned counts. */
export async function getAtlasLocusCategories(): Promise<AtlasCategorySummary[]> {
  const cats = await prisma.mediaCategory.findMany({
    where: { alignmentTemplateId: { not: null } },
    select: {
      id: true,
      name: true,
      sortOrder: true,
      group: { select: { name: true, sortOrder: true } },
      alignmentTemplate: { select: { aspectW: true, aspectH: true } },
    },
    orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
  if (cats.length === 0) return [];

  const links = await prisma.personMediaLink.findMany({
    where: { ...ALIGNED_LINK_WHERE, categoryId: { in: cats.map((c) => c.id) } },
    select: { categoryId: true, mediaItem: { select: { variants: true } } },
    orderBy: { createdAt: "desc" },
  });

  const byCat = new Map<string, { count: number; thumbs: string[] }>();
  for (const l of links) {
    if (!l.categoryId) continue;
    const entry = byCat.get(l.categoryId) ?? { count: 0, thumbs: [] };
    entry.count += 1;
    if (entry.thumbs.length < 4) {
      const thumb = bestThumb(l.mediaItem.variants);
      if (thumb) entry.thumbs.push(thumb);
    }
    byCat.set(l.categoryId, entry);
  }

  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    groupName: c.group.name,
    aspectW: c.alignmentTemplate?.aspectW ?? 2,
    aspectH: c.alignmentTemplate?.aspectH ?? 3,
    alignedCount: byCat.get(c.id)?.count ?? 0,
    sampleThumbs: byCat.get(c.id)?.thumbs ?? [],
  }));
}

export type AtlasTile = {
  mediaItemId: string;
  personId: string;
  personName: string;
  thumbUrl: string | null;
};

export type AtlasGrid = {
  category: { id: string; name: string; groupName: string; aspectW: number; aspectH: number } | null;
  tiles: AtlasTile[];
};

/** Every person's Aligned image in one locus category, ordered by person name. */
export async function getAtlasGridForCategory(categoryId: string): Promise<AtlasGrid> {
  const cat = await prisma.mediaCategory.findUnique({
    where: { id: categoryId },
    select: {
      id: true,
      name: true,
      group: { select: { name: true } },
      alignmentTemplate: { select: { aspectW: true, aspectH: true } },
    },
  });
  if (!cat || !cat.alignmentTemplate) return { category: null, tiles: [] };

  const links = await prisma.personMediaLink.findMany({
    where: { ...ALIGNED_LINK_WHERE, categoryId },
    select: {
      mediaItem: { select: { id: true, variants: true } },
      person: {
        select: {
          id: true,
          icgId: true,
          aliases: { where: { isCommon: true }, take: 1, select: { name: true } },
        },
      },
    },
  });

  const tiles: AtlasTile[] = links.map((l) => ({
    mediaItemId: l.mediaItem.id,
    personId: l.person.id,
    personName: getDisplayName(l.person.aliases[0]?.name ?? null, l.person.icgId),
    thumbUrl: bestThumb(l.mediaItem.variants),
  }));
  tiles.sort((a, b) => a.personName.localeCompare(b.personName));

  return {
    category: {
      id: cat.id,
      name: cat.name,
      groupName: cat.group.name,
      aspectW: cat.alignmentTemplate.aspectW,
      aspectH: cat.alignmentTemplate.aspectH,
    },
    tiles,
  };
}
