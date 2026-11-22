import sharp from "sharp";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { buildUrl } from "@/lib/media-url";
import { minioClient, getMinioBucket } from "@/lib/minio";
import { BODY_REGIONS } from "@/lib/constants/body-regions";
import { createTagDefinition, reorderTagDefinitions, setExtraParents, updateTagDefinition } from "@/lib/services/tag-service";
import { getComposerCatalog } from "@/lib/services/composer-service";
import { reframeTagExamples } from "@/lib/services/tag-example-service";
import type { ComposerCatalog, ComposerTag, FacetChoice, RelevanceLevel } from "@/lib/composer";

// Settings → Composer (ADR-0043, R4): the user maintains what the seeds started —
// the tree (paths, sections, facets, values and their order), each facet's
// choice, default level and framing, each value's region link, line drawing,
// parts and look-alikes. Relevance cells go through composer-relevance-service.

// ─── Reading ────────────────────────────────────────────────────────────────

export type ComposerManageData = {
  catalog: ComposerCatalog;
  /** tag id → photos carrying it */
  usage: Record<string, number>;
  /** tag id → its region catalogue id (Region facet) */
  regionCatalogIds: Record<string, string>;
  /** tag id → the tags it is not to be confused with (both directions) */
  confusables: Record<string, string[]>;
};

export async function getComposerManageData(): Promise<ComposerManageData> {
  const catalog = await getComposerCatalog();
  const ids = Object.keys(catalog.tags);
  const [counts, regions, pairs] = await Promise.all([
    prisma.mediaItemTag.groupBy({ by: ["tagDefinitionId"], where: { tagDefinitionId: { in: ids } }, _count: { _all: true } }),
    prisma.tagDefinition.findMany({ where: { id: { in: ids }, regionCatalogId: { not: null } }, select: { id: true, regionCatalogId: true } }),
    prisma.tagConfusable.findMany({ where: { OR: [{ tagAId: { in: ids } }, { tagBId: { in: ids } }] } }),
  ]);
  const confusables: Record<string, string[]> = {};
  for (const p of pairs) {
    (confusables[p.tagAId] ??= []).push(p.tagBId);
    (confusables[p.tagBId] ??= []).push(p.tagAId);
  }
  return {
    catalog,
    usage: Object.fromEntries(counts.map((c) => [c.tagDefinitionId, c._count._all])),
    regionCatalogIds: Object.fromEntries(regions.map((r) => [r.id, r.regionCatalogId!])),
    confusables,
  };
}

// ─── Guards ─────────────────────────────────────────────────────────────────

/** A facet is a tag group some Composer section shows */
async function assertFacet(groupId: string): Promise<void> {
  const n = await prisma.composerSectionGroup.count({ where: { groupId } });
  if (n === 0) throw new Error("This group is not a Composer facet");
}

async function assertValue(tagId: string): Promise<{ groupId: string; parentId: string | null; drawingKey: string | null }> {
  const tag = await prisma.tagDefinition.findUnique({ where: { id: tagId }, select: { groupId: true, parentId: true, drawingKey: true } });
  if (!tag) throw new Error("Unknown value");
  await assertFacet(tag.groupId);
  return tag;
}

const TILE_ASPECTS = new Set(["1:1", "3:4", "4:3", "2:3", "3:2", "9:16", "16:9"]);

function assertAspect(a: string): void {
  if (!TILE_ASPECTS.has(a)) throw new Error(`Unknown tile shape "${a}"`);
}

function assertFraction(v: number | null, what: string, max = 1): void {
  if (v === null) return;
  if (!Number.isFinite(v) || v < 0 || v > max) throw new Error(`${what} must lie between 0 and ${max}`);
}

/** Every region and sub-region id of the body-region catalogue */
export function regionCatalogIdSet(): Set<string> {
  const ids = new Set<string>();
  for (const r of BODY_REGIONS) {
    ids.add(r.id);
    for (const s of r.subRegions ?? []) ids.add(s.id);
  }
  return ids;
}

// ─── The tree ───────────────────────────────────────────────────────────────

export async function updateComposerPath(
  id: string,
  data: { name?: string; tileAspect?: string; pinned?: boolean; personal?: boolean },
): Promise<void> {
  const name = data.name?.trim();
  if (data.name !== undefined && !name) throw new Error("A path needs a name");
  if (data.tileAspect !== undefined) assertAspect(data.tileAspect);
  await prisma.composerPath.update({
    where: { id },
    data: { name, tileAspect: data.tileAspect, pinned: data.pinned, personal: data.personal },
  });
  // The tiles took another shape: the examples are cut again from their boxes
  if (data.tileAspect !== undefined) {
    const groups = await prisma.composerSectionGroup.findMany({ where: { section: { pathId: id } }, select: { groupId: true } });
    const tags = await prisma.tagDefinition.findMany({ where: { groupId: { in: groups.map((g) => g.groupId) } }, select: { id: true } });
    await reframeTagExamples(tags.map((t) => t.id));
  }
}

export async function updateComposerSection(id: string, data: { name?: string; passable?: boolean }): Promise<void> {
  const name = data.name?.trim();
  if (data.name !== undefined && !name) throw new Error("A section needs a name");
  await prisma.composerSection.update({ where: { id }, data: { name, passable: data.passable } });
}

export type FacetPatch = {
  choice?: FacetChoice;
  defaultLevel?: RelevanceLevel;
  /** null = inherit the path's rule */
  framingFill?: number | null;
  framingTop?: number | null;
  tileAspect?: string | null;
};

export async function updateComposerFacet(groupId: string, data: FacetPatch): Promise<void> {
  await assertFacet(groupId);
  if (data.framingFill !== undefined) assertFraction(data.framingFill, "The fill");
  if (data.framingTop !== undefined) assertFraction(data.framingTop, "The top margin", 0.5);
  if (data.framingFill === 0) throw new Error("The fill must be above 0");
  if (data.tileAspect) assertAspect(data.tileAspect);
  await prisma.tagGroup.update({
    where: { id: groupId },
    data: {
      composerChoice: data.choice,
      composerDefault: data.defaultLevel,
      framingFill: data.framingFill,
      framingTop: data.framingTop,
      tileAspect: data.tileAspect,
    },
  });
  if (data.framingFill !== undefined || data.framingTop !== undefined || data.tileAspect !== undefined) {
    const tags = await prisma.tagDefinition.findMany({ where: { groupId }, select: { id: true } });
    await reframeTagExamples(tags.map((t) => t.id));
  }
}

export type ReorderKind = "path" | "section" | "facet" | "value";

/**
 * Put the children of one parent in this order: paths (no parent), a path's
 * sections, a section's facets, a facet's values. The ids must be exactly the
 * parent's children.
 */
export async function reorderComposer(kind: ReorderKind, parentId: string | null, orderedIds: string[]): Promise<void> {
  const same = (have: string[]) => have.length === orderedIds.length && have.every((id) => orderedIds.includes(id));
  const refuse = () => {
    throw new Error("The order does not match the tree — reload and try again");
  };
  switch (kind) {
    case "path": {
      const have = (await prisma.composerPath.findMany({ select: { id: true } })).map((p) => p.id);
      if (!same(have)) refuse();
      await prisma.$transaction(orderedIds.map((id, i) => prisma.composerPath.update({ where: { id }, data: { sortOrder: i } })));
      return;
    }
    case "section": {
      const have = (await prisma.composerSection.findMany({ where: { pathId: parentId ?? "" }, select: { id: true } })).map((s) => s.id);
      if (!same(have)) refuse();
      await prisma.$transaction(orderedIds.map((id, i) => prisma.composerSection.update({ where: { id }, data: { sortOrder: i } })));
      return;
    }
    case "facet": {
      const sectionId = parentId ?? "";
      const have = (await prisma.composerSectionGroup.findMany({ where: { sectionId }, select: { groupId: true } })).map((g) => g.groupId);
      if (!same(have)) refuse();
      await prisma.$transaction(
        orderedIds.map((groupId, i) =>
          prisma.composerSectionGroup.update({ where: { sectionId_groupId: { sectionId, groupId } }, data: { sortOrder: i } }),
        ),
      );
      return;
    }
    case "value": {
      await assertFacet(parentId ?? "");
      const have = (await prisma.tagDefinition.findMany({ where: { groupId: parentId ?? "" }, select: { id: true } })).map((t) => t.id);
      if (!same(have)) refuse();
      await reorderTagDefinitions(orderedIds);
      return;
    }
  }
}

// ─── Values ─────────────────────────────────────────────────────────────────

/** The Composer's view of a tag, as the workbench holds it */
async function composerTagOf(tagId: string): Promise<ComposerTag> {
  const t = await prisma.tagDefinition.findUniqueOrThrow({
    where: { id: tagId },
    select: {
      id: true,
      name: true,
      description: true,
      groupId: true,
      parentId: true,
      drawingKey: true,
      regionCatalogId: true,
      extraParents: { orderBy: { sortOrder: "asc" }, select: { parentId: true } },
    },
  });
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    groupId: t.groupId,
    parentIds: [...(t.parentId ? [t.parentId] : []), ...t.extraParents.map((p) => p.parentId)],
    drawingUrl: t.drawingKey ? buildUrl(t.drawingKey) : null,
    region: !!t.regionCatalogId,
  };
}

/**
 * A new value in a facet — at its end, with no relevance rows of its own, so it
 * inherits the facet's (and the path's) under every context.
 */
export async function createComposerValue(groupId: string, name: string, description?: string | null): Promise<ComposerTag> {
  await assertFacet(groupId);
  const tag = await createTagDefinition({ groupId, name, description: description?.trim() || undefined });
  return composerTagOf(tag.id);
}

export async function updateComposerValue(
  tagId: string,
  data: { name?: string; description?: string | null; regionCatalogId?: string | null },
): Promise<void> {
  await assertValue(tagId);
  if (data.regionCatalogId) {
    if (!regionCatalogIdSet().has(data.regionCatalogId)) throw new Error(`Unknown body region "${data.regionCatalogId}"`);
  }
  if (data.name !== undefined || data.description !== undefined)
    await updateTagDefinition(tagId, {
      name: data.name,
      description: data.description === undefined ? undefined : data.description?.trim() || null,
    });
  if (data.regionCatalogId !== undefined)
    await prisma.tagDefinition.update({ where: { id: tagId }, data: { regionCatalogId: data.regionCatalogId } });
}

/**
 * A value's parents, in order — the first becomes `parentId` (the tree shows it
 * there), the rest further parents. A named form is a value whose parents are its
 * parts (seiza = sitting + folded + legs-together). Cycles are refused.
 */
export async function setComposerValueParents(tagId: string, parentIds: string[]): Promise<void> {
  await assertValue(tagId);
  const wanted = [...new Set(parentIds)].filter((p) => p !== tagId);
  const [first, ...rest] = wanted;
  // Clear the further parents first, so the new first parent never sits in both
  await setExtraParents(tagId, []);
  await updateTagDefinition(tagId, { parentId: first ?? null });
  await setExtraParents(tagId, rest);
}

/** A named form from its parts: a new value in `groupId` whose parents are the parts */
export async function createComposerCombination(groupId: string, name: string, partIds: string[]): Promise<ComposerTag> {
  if (partIds.length < 2) throw new Error("A named form needs at least two parts");
  const tag = await createComposerValue(groupId, name);
  await setComposerValueParents(tag.id, partIds);
  return composerTagOf(tag.id);
}

/** The tags a value is not to be confused with — the whole list, both directions */
export async function setComposerConfusables(tagId: string, otherIds: string[]): Promise<void> {
  await assertValue(tagId);
  const others = [...new Set(otherIds)].filter((o) => o !== tagId);
  await prisma.$transaction([
    prisma.tagConfusable.deleteMany({ where: { OR: [{ tagAId: tagId }, { tagBId: tagId }] } }),
    prisma.tagConfusable.createMany({
      data: others.map((o) => (tagId < o ? { tagAId: tagId, tagBId: o } : { tagAId: o, tagBId: tagId })),
      skipDuplicates: true,
    }),
  ]);
}

// ─── Line drawings ──────────────────────────────────────────────────────────

const DRAWING_MAX_PX = 512;

async function removeObject(key: string | null): Promise<void> {
  if (!key) return;
  await minioClient
    .send(new DeleteObjectCommand({ Bucket: getMinioBucket(), Key: key }))
    .catch((err) => console.error("[composer-manage] old drawing not removed", key, err));
}

/**
 * A value's line drawing (ADR-0043): SVG or a raster, strictly decoded and
 * rendered to a transparent WebP of at most 512 px — an SVG is never stored as
 * such, so no script in it is ever served. Replaces the previous drawing.
 */
export async function setComposerDrawing(tagId: string, buffer: Buffer): Promise<{ url: string }> {
  const before = await assertValue(tagId);
  const processed = await sharp(buffer, { failOn: "error", density: 300 })
    .rotate()
    .resize({ width: DRAWING_MAX_PX, height: DRAWING_MAX_PX, fit: "inside" })
    .webp({ quality: 92, alphaQuality: 100 })
    .toBuffer();
  const key = `composer/drawings/${tagId}-${Date.now()}.webp`;
  await minioClient.send(new PutObjectCommand({ Bucket: getMinioBucket(), Key: key, Body: processed, ContentType: "image/webp" }));
  await prisma.tagDefinition.update({ where: { id: tagId }, data: { drawingKey: key } });
  await removeObject(before.drawingKey);
  return { url: buildUrl(key) };
}

export async function clearComposerDrawing(tagId: string): Promise<void> {
  const before = await assertValue(tagId);
  await prisma.tagDefinition.update({ where: { id: tagId }, data: { drawingKey: null } });
  await removeObject(before.drawingKey);
}
