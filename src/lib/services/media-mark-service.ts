import { prisma } from "@/lib/db";
import { markCascade, type MarkKey } from "@/lib/media-mark-tiers";
import type { TxClient } from "./cascade-helpers";
import type { PaletteTag } from "./tag-service";

// The two photo marks that live as tags (2026-10-16): `iconic` and `outtake`, with
// ★ (MediaItem.isFavorite) the three marks you set while browsing — buttons in the
// lightbox, badges and hover buttons on tiles, buttons in the bulk bar. They stay
// ordinary tags in the Judgment group, so filters, the person showcase and bulk
// tagging keep working; a missing one is created there on first use.

export type MarkTagKey = "iconic" | "outtake";
export type MarkTags = Record<MarkTagKey, PaletteTag>;

const JUDGMENT = {
  slug: "judgment",
  name: "Judgment",
  color: "#ef4444",
  description: "Your own assessment",
} as const;

const TAG_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  parentId: true,
  typicalLevel: true,
  sortOrder: true,
  group: {
    select: { id: true, name: true, slug: true, color: true, isExclusive: true, domain: true, typicalLevel: true, kind: true },
  },
} as const;

async function markTag(slug: MarkTagKey): Promise<PaletteTag> {
  // The Judgment group's tag of that name, else another group's
  const candidates = await prisma.tagDefinition.findMany({ where: { slug }, select: TAG_SELECT });
  const existing = candidates.find((t) => t.group.slug === JUDGMENT.slug) ?? candidates[0];
  if (existing) return { ...existing, usageCount: 0 };

  const group = await prisma.tagGroup.upsert({
    where: { slug: JUDGMENT.slug },
    create: { ...JUDGMENT, domain: "ANY" },
    update: {},
  });
  const created = await prisma.tagDefinition.upsert({
    where: { groupId_slug: { groupId: group.id, slug } },
    create: { groupId: group.id, name: slug, slug, nameNorm: slug },
    update: {},
    select: TAG_SELECT,
  });
  return { ...created, usageCount: 0 };
}

export async function getMarkTags(): Promise<MarkTags> {
  const [iconic, outtake] = await Promise.all([markTag("iconic"), markTag("outtake")]);
  return { iconic, outtake };
}

// ─── Tiers (2026-10-17) ─────────────────────────────────────────────────────

export type MarkChange = { key: MarkKey; on: boolean };
const MARK_TAG_SLUGS: MarkTagKey[] = ["iconic", "outtake"];

/** The mark changes in adding (`on`) or removing these tags: those that are iconic / outtake */
export async function markChangesForTags(tx: TxClient, tagDefinitionIds: string[], on: boolean): Promise<MarkChange[]> {
  if (tagDefinitionIds.length === 0) return [];
  const defs = await tx.tagDefinition.findMany({
    where: { id: { in: tagDefinitionIds }, slug: { in: MARK_TAG_SLUGS } },
    select: { slug: true },
  });
  return [...new Set(defs.map((d) => d.slug as MarkTagKey))].map((key) => ({ key, on }));
}

/** The iconic / outtake marks these photos carry now (by tag slug) */
export async function currentMarkTags(tx: TxClient, mediaItemId: string): Promise<Set<MarkTagKey>> {
  const rows = await tx.mediaItemTag.findMany({
    where: { mediaItemId, tagDefinition: { slug: { in: MARK_TAG_SLUGS } } },
    select: { tagDefinition: { select: { slug: true } } },
  });
  return new Set(rows.map((r) => r.tagDefinition.slug as MarkTagKey));
}

/**
 * After marks changed on these photos, set the ones the tiers imply: a higher mark
 * set → every lower one set; a lower one cleared → every higher one cleared. The
 * changed marks themselves are already written by the caller and left alone.
 */
export async function cascadeMarks(tx: TxClient, mediaItemIds: string[], changes: MarkChange[]): Promise<void> {
  if (mediaItemIds.length === 0 || changes.length === 0) return;
  const implied = new Map<MarkKey, boolean>();
  for (const c of changes) for (const [k, v] of Object.entries(markCascade(c.key, c.on))) implied.set(k as MarkKey, v);
  for (const c of changes) implied.delete(c.key);
  if (implied.size === 0) return;

  const favorite = implied.get("favorite");
  if (favorite !== undefined) {
    await tx.mediaItem.updateMany({ where: { id: { in: mediaItemIds } }, data: { isFavorite: favorite } });
  }
  const tagKeys = MARK_TAG_SLUGS.filter((k) => implied.has(k));
  if (tagKeys.length === 0) return;
  const tags = await getMarkTags();
  for (const key of tagKeys) {
    if (implied.get(key)) {
      await tx.mediaItemTag.createMany({
        data: mediaItemIds.map((mediaItemId) => ({ mediaItemId, tagDefinitionId: tags[key].id, source: "MANUAL" as const })),
        skipDuplicates: true,
      });
    } else {
      // Every tag of that slug, as the showcase reads marks by slug
      await tx.mediaItemTag.deleteMany({
        where: { mediaItemId: { in: mediaItemIds }, tagDefinition: { slug: key } },
      });
    }
  }
}

/** ★ on / off for photos, with the marks it implies */
export async function setMediaFavorite(mediaItemIds: string[], isFavorite: boolean): Promise<void> {
  if (mediaItemIds.length === 0) return;
  await prisma.$transaction(async (tx) => {
    await tx.mediaItem.updateMany({ where: { id: { in: mediaItemIds } }, data: { isFavorite } });
    await cascadeMarks(tx, mediaItemIds, [{ key: "favorite", on: isFavorite }]);
  });
}
