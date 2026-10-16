import { prisma } from "@/lib/db";
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
