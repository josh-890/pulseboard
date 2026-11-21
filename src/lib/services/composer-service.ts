import { prisma } from "@/lib/db";
import { PHOTO_WHERE } from "@/lib/media-role";
import { buildPhotoUrls } from "@/lib/media-url";
import { parsePhotoVariants } from "@/lib/types";
import { toTagName } from "@/lib/tag-names";
import { setExtraParents } from "@/lib/services/tag-service";
import { getTitleExamples } from "@/lib/services/tag-example-service";
import {
  combinationName,
  composerTagIds,
  type ComposerCatalog,
  type ComposerStateRule,
  type ComposerTag,
} from "@/lib/composer";

// The Tag Composer's data (ADR-0042): the catalogue it shows, the photos of a
// set or session with their Composer tags, and the two writes — applying a
// composition, and creating a state × garment combination the first time.

// ─── Catalogue ──────────────────────────────────────────────────────────────

/** Whether this tenant has a Composer at all — the entry points hide otherwise */
export async function hasComposer(): Promise<boolean> {
  return (await prisma.composerPath.count()) > 0;
}

export async function getComposerCatalog(): Promise<ComposerCatalog> {
  const paths = await prisma.composerPath.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: { groups: { orderBy: { sortOrder: "asc" }, select: { groupId: true } } },
      },
    },
  });
  const groupIds = [...new Set(paths.flatMap((p) => p.sections.flatMap((s) => s.groups.map((g) => g.groupId))))];
  const [groups, rules] = await Promise.all([
    prisma.tagGroup.findMany({
      where: { id: { in: groupIds } },
      select: {
        id: true,
        name: true,
        isExclusive: true,
        tags: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            description: true,
            groupId: true,
            parentId: true,
            extraParents: { orderBy: { sortOrder: "asc" }, select: { parentId: true } },
          },
        },
      },
    }),
    prisma.tagStateRule.findMany({ include: { targets: true } }),
  ]);

  const tags: Record<string, ComposerTag> = {};
  for (const g of groups)
    for (const t of g.tags)
      tags[t.id] = {
        id: t.id,
        name: t.name,
        description: t.description,
        groupId: t.groupId,
        parentIds: [...(t.parentId ? [t.parentId] : []), ...t.extraParents.map((p) => p.parentId)],
      };

  const titles = await getTitleExamples(Object.keys(tags));
  for (const [id, ex] of Object.entries(titles)) if (tags[id]) tags[id].example = ex;

  const stateRules: ComposerStateRule[] = rules.map((r) => ({
    stateGroupId: r.stateGroupId,
    genericTagId: r.genericTagId,
    namePattern: r.namePattern,
    garmentGroupIds: r.targets.flatMap((t) => (t.groupId ? [t.groupId] : [])),
    garmentTagIds: r.targets.flatMap((t) => (t.tagId && !t.nameOverride ? [t.tagId] : [])),
    overrides: Object.fromEntries(r.targets.flatMap((t) => (t.tagId && t.nameOverride ? [[t.tagId, t.nameOverride]] : []))),
  }));

  return {
    paths: paths.map((p) => ({
      id: p.id,
      name: p.name,
      tileAspect: p.tileAspect,
      pinned: p.pinned,
      sections: p.sections.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        passable: s.passable,
        groupIds: s.groups.map((g) => g.groupId),
      })),
    })),
    groups: Object.fromEntries(
      groups.map((g) => [g.id, { id: g.id, name: g.name, isExclusive: g.isExclusive, tagIds: g.tags.map((t) => t.id) }]),
    ),
    tags,
    stateRules,
  };
}

// ─── Photos ─────────────────────────────────────────────────────────────────

export type ComposerPhoto = {
  id: string;
  filename: string;
  width: number;
  height: number;
  thumbUrl: string | null;
  viewUrl: string | null;
  /** The photo's own tags in Composer groups (direct rows only) */
  tagIds: string[];
};

type PhotoRow = {
  id: string;
  filename: string;
  originalWidth: number;
  originalHeight: number;
  variants: unknown;
  fileRef: string | null;
  mediaItemTags: { tagDefinitionId: string }[];
};

const PHOTO_SELECT = {
  id: true,
  filename: true,
  originalWidth: true,
  originalHeight: true,
  variants: true,
  fileRef: true,
  mediaItemTags: { select: { tagDefinitionId: true } },
} as const;

function toPhoto(row: PhotoRow, composerIds: Set<string>): ComposerPhoto {
  const urls = buildPhotoUrls(parsePhotoVariants(row.variants) ?? {}, row.fileRef);
  return {
    id: row.id,
    filename: row.filename,
    width: row.originalWidth,
    height: row.originalHeight,
    thumbUrl: urls.gallery_512 ?? urls.view_1200 ?? (urls.original || null),
    viewUrl: urls.view_1200 ?? urls.full_2400 ?? (urls.original || null),
    tagIds: row.mediaItemTags.map((t) => t.tagDefinitionId).filter((id) => composerIds.has(id)),
  };
}

export type ComposerScope = { kind: "set"; id: string } | { kind: "session"; id: string };

export type ComposerWorkspace = { title: string; backHref: string; photos: ComposerPhoto[] };

/** A set's photos in gallery order, or a session's in upload order */
export async function getComposerWorkspace(scope: ComposerScope, catalog: ComposerCatalog): Promise<ComposerWorkspace | null> {
  const composerIds = composerTagIds(catalog);
  if (scope.kind === "set") {
    const set = await prisma.set.findUnique({ where: { id: scope.id }, select: { id: true, title: true } });
    if (!set) return null;
    const links = await prisma.setMediaItem.findMany({
      where: { setId: set.id, mediaItem: { mediaType: "PHOTO", ...PHOTO_WHERE } },
      orderBy: { sortOrder: "asc" },
      select: { mediaItem: { select: PHOTO_SELECT } },
    });
    return { title: set.title, backHref: `/sets/${set.id}`, photos: links.map((l) => toPhoto(l.mediaItem, composerIds)) };
  }
  const session = await prisma.session.findUnique({ where: { id: scope.id }, select: { id: true, name: true } });
  if (!session) return null;
  const items = await prisma.mediaItem.findMany({
    where: { sessionId: session.id, mediaType: "PHOTO", ...PHOTO_WHERE },
    orderBy: { createdAt: "asc" },
    select: PHOTO_SELECT,
  });
  return { title: session.name, backHref: `/sessions/${session.id}`, photos: items.map((i) => toPhoto(i, composerIds)) };
}

// ─── Writes ─────────────────────────────────────────────────────────────────

/**
 * Write a composition onto photos: remove `removes`, add `adds`. Only tags the
 * Composer shows are accepted. In an exclusive group an added tag replaces the
 * photo's other tag of that group — the same rule the draft follows, kept here
 * too because a composition may meet photos the draft never saw (S3).
 * Returns the photos' Composer tags afterwards.
 */
export async function applyComposition(
  mediaIds: string[],
  adds: string[],
  removes: string[],
): Promise<Record<string, string[]>> {
  const ids = [...new Set(mediaIds)];
  if (ids.length === 0) return {};
  const catalog = await getComposerCatalog();
  const allowed = composerTagIds(catalog);
  const bad = [...adds, ...removes].find((t) => !allowed.has(t));
  if (bad) throw new Error("Only Composer tags can be written this way");

  const exclusiveGroupsOfAdds = [...new Set(adds.map((t) => catalog.tags[t].groupId))].filter((g) => catalog.groups[g]?.isExclusive);
  const replaced = exclusiveGroupsOfAdds.flatMap((g) => catalog.groups[g].tagIds.filter((t) => !adds.includes(t)));

  await prisma.$transaction(async (tx) => {
    const drop = [...new Set([...removes, ...replaced])];
    if (drop.length) await tx.mediaItemTag.deleteMany({ where: { mediaItemId: { in: ids }, tagDefinitionId: { in: drop } } });
    if (adds.length)
      await tx.mediaItemTag.createMany({
        data: ids.flatMap((mediaItemId) => adds.map((tagDefinitionId) => ({ mediaItemId, tagDefinitionId, source: "MANUAL" as const }))),
        skipDuplicates: true,
      });
  });

  const rows = await prisma.mediaItemTag.findMany({
    where: { mediaItemId: { in: ids }, tagDefinitionId: { in: [...allowed] } },
    select: { mediaItemId: true, tagDefinitionId: true },
  });
  const result: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, []]));
  for (const r of rows) result[r.mediaItemId].push(r.tagDefinitionId);
  return result;
}

/**
 * The state × garment combination (ADR-0042): found by name, or created in the
 * state's group with the garment as its first parent and the generic state tag
 * (torn-clothes) as a further one. Returned in the Composer's tag shape.
 */
export async function ensureStateCombination(stateGroupId: string, garmentTagId: string): Promise<ComposerTag> {
  const catalog = await getComposerCatalog();
  const rule = catalog.stateRules.find((r) => r.stateGroupId === stateGroupId);
  const garment = catalog.tags[garmentTagId];
  if (!rule || !garment) throw new Error("Unknown state or garment");
  const fits = rule.garmentTagIds.includes(garment.id) || rule.garmentGroupIds.includes(garment.groupId) || garment.id in rule.overrides;
  if (!fits) throw new Error(`That state does not apply to ${garment.name}`);
  const name = toTagName(combinationName(rule, garment));

  const existing = await prisma.tagDefinition.findFirst({ where: { slug: name }, select: { id: true } });
  let id = existing?.id;
  if (!id) {
    const aliasClash = await prisma.tagAlias.findFirst({ where: { slug: name }, select: { tagDefinitionId: true } });
    if (aliasClash) id = aliasClash.tagDefinitionId;
  }
  if (!id) {
    const order = await prisma.tagDefinition.aggregate({ where: { groupId: stateGroupId }, _max: { sortOrder: true } });
    const created = await prisma.tagDefinition.create({
      data: { groupId: stateGroupId, name, slug: name, nameNorm: name, parentId: garment.id, sortOrder: (order._max.sortOrder ?? 0) + 1 },
    });
    await setExtraParents(created.id, [rule.genericTagId]);
    id = created.id;
  }
  const t = await prisma.tagDefinition.findUniqueOrThrow({
    where: { id },
    select: { id: true, name: true, description: true, groupId: true, parentId: true, extraParents: { orderBy: { sortOrder: "asc" }, select: { parentId: true } } },
  });
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    groupId: t.groupId,
    parentIds: [...(t.parentId ? [t.parentId] : []), ...t.extraParents.map((p) => p.parentId)],
  };
}
