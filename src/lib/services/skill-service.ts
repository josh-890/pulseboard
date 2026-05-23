import { prisma } from "@/lib/db";
import type { SkillLevel, SkillEventType, DatePrecision } from "@/generated/prisma/client";
import type { PersonSkillItem, PersonSkillEventItem, SkillEventMediaThumb, PhotoVariants, GalleryItem } from "@/lib/types";
import { buildUrl, buildPhotoUrls } from "@/lib/media-url";
import { deriveInterval } from "@/lib/utils/event-interval";

/** Map skill event media rows to thumb type */
function mapEventMedia(
  media: { mediaItem: { id: string; variants: unknown; fileRef: string | null; originalWidth: number; originalHeight: number } }[],
): SkillEventMediaThumb[] {
  return media.map((m) => {
    const variants = (m.mediaItem.variants as PhotoVariants) ?? {};
    const thumbUrl = variants.gallery_512
      ? buildUrl(variants.gallery_512)
      : m.mediaItem.fileRef
        ? buildUrl(m.mediaItem.fileRef)
        : "";
    return {
      id: m.mediaItem.id,
      thumbUrl,
      originalWidth: m.mediaItem.originalWidth,
      originalHeight: m.mediaItem.originalHeight,
    };
  });
}

// ─── Person Skills (enriched) ────────────────────────────────────────────────

export async function getPersonSkillsEnriched(
  personId: string,
): Promise<PersonSkillItem[]> {
  const skills = await prisma.personSkill.findMany({
    where: { personId },
    include: {
      era: { select: { label: true } },
      skillDefinition: {
        include: { group: { select: { name: true } } },
      },
      events: {
        include: {
          era: { select: { label: true, date: true } },
          media: {
            include: { mediaItem: { select: { id: true, variants: true, fileRef: true, originalWidth: true, originalHeight: true } } },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return skills.map((s) => {
    const { validFrom, validTo } = deriveInterval(s.events);
    return {
    id: s.id,
    name: s.name,
    category: s.category,
    level: s.level,
    evidence: s.evidence,
    validFrom,
    validTo,
    eraLabel: s.era?.label ?? null,
    skillDefinitionId: s.skillDefinitionId,
    groupName: s.skillDefinition?.group.name ?? null,
    definitionName: s.skillDefinition?.name ?? null,
    definitionDescription: s.skillDefinition?.description ?? null,
    definitionPgrade: s.skillDefinition?.pgrade ?? null,
    events: s.events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      level: e.level,
      notes: e.notes,
      date: e.date,
      datePrecision: e.datePrecision,
      eraLabel: e.era?.label ?? null,
      eraDate: e.era?.date ?? null,
      media: mapEventMedia(e.media),
    })),
  };
  });
}

// ─── Person Skill CRUD ───────────────────────────────────────────────────────

export async function createPersonSkill(data: {
  personId: string;
  eraId?: string | null;
  skillDefinitionId?: string | null;
  name?: string;
  category?: string | null;
  level?: SkillLevel | null;
  evidence?: string | null;
  validFrom?: Date | null;
  validTo?: Date | null;
}) {
  let name = data.name ?? "";
  let category = data.category ?? null;

  // If linked to a definition, copy name/category from it
  if (data.skillDefinitionId) {
    const def = await prisma.skillDefinition.findUnique({
      where: { id: data.skillDefinitionId },
      include: { group: { select: { name: true } } },
    });
    if (def) {
      name = def.name;
      category = def.group.name;
    }
  }

  return prisma.$transaction(async (tx) => {
    const skill = await tx.personSkill.create({
      data: {
        personId: data.personId,
        eraId: data.eraId ?? null,
        skillDefinitionId: data.skillDefinitionId ?? null,
        name,
        category,
        level: data.level ?? null,
        evidence: data.evidence ?? null,
      },
    });
    await syncSkillIntervalEvents(tx, skill.id, data.validFrom, data.validTo, data.eraId ?? null);
    return skill;
  });
}

export async function updatePersonSkill(
  id: string,
  data: {
    level?: SkillLevel | null;
    evidence?: string | null;
    validFrom?: Date | null;
    validTo?: Date | null;
    eraId?: string | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    const { validFrom, validTo, ...rest } = data;
    const skill = await tx.personSkill.update({ where: { id }, data: rest });
    await syncSkillIntervalEvents(tx, id, validFrom, validTo, skill.eraId);
    return skill;
  });
}

// Replace the ACQUIRED / RETIRED events for a skill with the given dates.
// Only the side of the interval explicitly passed (not `undefined`) is touched.
async function syncSkillIntervalEvents(
  tx: import("@/generated/prisma/client").Prisma.TransactionClient,
  personSkillId: string,
  validFrom: Date | null | undefined,
  validTo: Date | null | undefined,
  eraId: string | null,
): Promise<void> {
  if (validFrom !== undefined) {
    await tx.personSkillEvent.deleteMany({ where: { personSkillId, eventType: "ACQUIRED" } });
    if (validFrom !== null) {
      await tx.personSkillEvent.create({
        data: { personSkillId, eraId, eventType: "ACQUIRED", date: validFrom },
      });
    }
  }
  if (validTo !== undefined) {
    await tx.personSkillEvent.deleteMany({ where: { personSkillId, eventType: "RETIRED" } });
    if (validTo !== null) {
      await tx.personSkillEvent.create({
        data: { personSkillId, eraId, eventType: "RETIRED", date: validTo },
      });
    }
  }
}

export async function deletePersonSkill(id: string) {
  return prisma.$transaction(async (tx) => {
    // Get event IDs to clean up media
    const events = await tx.personSkillEvent.findMany({
      where: { personSkillId: id },
      select: { id: true },
    });
    const eventIds = events.map((e) => e.id);
    if (eventIds.length > 0) {
      await tx.skillEventMedia.deleteMany({
        where: { skillEventId: { in: eventIds } },
      });
    }
    // Delete events
    await tx.personSkillEvent.deleteMany({
      where: { personSkillId: id },
    });
    // Delete the skill
    return tx.personSkill.delete({
      where: { id },
    });
  });
}

// ─── Skill Events ────────────────────────────────────────────────────────────

export async function createSkillEvent(data: {
  personSkillId: string;
  eraId?: string | null;
  eventType: SkillEventType;
  level?: SkillLevel | null;
  notes?: string | null;
  date?: Date | null;
  datePrecision?: string;
}) {
  return prisma.personSkillEvent.create({
    data: {
      personSkillId: data.personSkillId,
      eraId: data.eraId ?? null,
      eventType: data.eventType,
      level: data.level ?? null,
      notes: data.notes ?? null,
      date: data.date ?? null,
      datePrecision: (data.datePrecision as DatePrecision) ?? "UNKNOWN",
    },
  });
}

export async function deleteSkillEvent(id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.skillEventMedia.deleteMany({ where: { skillEventId: id } });
    return tx.personSkillEvent.delete({
      where: { id },
    });
  });
}

// ─── Skill Timeline ──────────────────────────────────────────────────────────

export async function getSkillTimeline(
  personId: string,
): Promise<
  (PersonSkillEventItem & { skillName: string; skillId: string })[]
> {
  const events = await prisma.personSkillEvent.findMany({
    where: {
      personSkill: { personId },
    },
    include: {
      era: { select: { label: true, date: true } },
      personSkill: { select: { id: true, name: true } },
      media: {
        include: { mediaItem: { select: { id: true, variants: true, fileRef: true, originalWidth: true, originalHeight: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Sort by event date, then era date, then createdAt
  const sorted = [...events].sort((a, b) => {
    const aDate = a.date ?? a.era?.date ?? a.createdAt;
    const bDate = b.date ?? b.era?.date ?? b.createdAt;
    return aDate.getTime() - bDate.getTime();
  });

  return sorted.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    level: e.level,
    notes: e.notes,
    date: e.date,
    datePrecision: e.datePrecision,
    eraLabel: e.era?.label ?? null,
    eraDate: e.era?.date ?? null,
    media: mapEventMedia(e.media),
    skillName: e.personSkill.name,
    skillId: e.personSkill.id,
  }));
}

// ─── Skill Event Media ────────────────────────────────────────────────────────

export async function addMediaToSkillEvent(
  skillEventId: string,
  mediaItemIds: string[],
) {
  if (mediaItemIds.length === 0) return;
  await prisma.skillEventMedia.createMany({
    data: mediaItemIds.map((mediaItemId, i) => ({
      skillEventId,
      mediaItemId,
      sortOrder: i,
    })),
    skipDuplicates: true,
  });
}

export async function removeMediaFromSkillEvent(
  skillEventId: string,
  mediaItemId: string,
) {
  await prisma.skillEventMedia.delete({
    where: {
      skillEventId_mediaItemId: { skillEventId, mediaItemId },
    },
  });
}

export async function getSkillEventMediaAsGalleryItems(
  skillEventId: string,
): Promise<GalleryItem[]> {
  const rows = await prisma.skillEventMedia.findMany({
    where: { skillEventId },
    include: {
      mediaItem: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  return rows.map((row) => {
    const item = row.mediaItem;
    const variants = (item.variants as PhotoVariants) ?? {};
    return {
      id: item.id,
      filename: item.filename,
      mimeType: item.mimeType,
      originalWidth: item.originalWidth,
      originalHeight: item.originalHeight,
      caption: item.caption,
      createdAt: item.createdAt,
      urls: buildPhotoUrls(variants, item.fileRef),
      focalX: item.focalX,
      focalY: item.focalY,
      tags: item.tags,
      isFavorite: false,
      isAvatar: false,
      sortOrder: row.sortOrder,
      isCover: false,
    };
  });
}
