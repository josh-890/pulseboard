import { prisma } from "@/lib/db";
import type { SkillLevel, SkillEventType, DatePrecision } from "@/generated/prisma/client";
import type { PersonSkillItem, PersonSkillEventItem, SkillEventMediaThumb, PhotoVariants, GalleryItem, PhotoUrls } from "@/lib/types";

const BASE_URL = process.env.NEXT_PUBLIC_MINIO_URL!;

function buildUrl(key: string): string {
  return `${BASE_URL}/${key}`;
}

function buildPhotoUrls(variants: PhotoVariants, fileRef?: string | null): PhotoUrls {
  const originalUrl = variants.original
    ? buildUrl(variants.original)
    : fileRef
      ? buildUrl(fileRef)
      : "";
  return {
    original: originalUrl,
    profile_128: variants.profile_128 ? buildUrl(variants.profile_128) : null,
    profile_256: variants.profile_256 ? buildUrl(variants.profile_256) : null,
    profile_512: variants.profile_512 ? buildUrl(variants.profile_512) : null,
    profile_768: variants.profile_768 ? buildUrl(variants.profile_768) : null,
    gallery_512: variants.gallery_512 ? buildUrl(variants.gallery_512) : null,
    gallery_1024: variants.gallery_1024 ? buildUrl(variants.gallery_1024) : null,
    gallery_1600: variants.gallery_1600 ? buildUrl(variants.gallery_1600) : null,
  };
}

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
      persona: { select: { label: true } },
      skillDefinition: {
        include: { group: { select: { name: true } } },
      },
      events: {
        include: {
          persona: { select: { label: true, date: true } },
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

  return skills.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    level: s.level,
    evidence: s.evidence,
    validFrom: s.validFrom,
    validTo: s.validTo,
    personaLabel: s.persona?.label ?? null,
    skillDefinitionId: s.skillDefinitionId,
    groupName: s.skillDefinition?.group.name ?? null,
    definitionName: s.skillDefinition?.name ?? null,
    events: s.events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      level: e.level,
      notes: e.notes,
      date: e.date,
      datePrecision: e.datePrecision,
      personaLabel: e.persona?.label ?? null,
      personaDate: e.persona?.date ?? null,
      media: mapEventMedia(e.media),
    })),
  }));
}

// ─── Person Skill CRUD ───────────────────────────────────────────────────────

export async function createPersonSkill(data: {
  personId: string;
  personaId?: string | null;
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

  return prisma.personSkill.create({
    data: {
      personId: data.personId,
      personaId: data.personaId ?? null,
      skillDefinitionId: data.skillDefinitionId ?? null,
      name,
      category,
      level: data.level ?? null,
      evidence: data.evidence ?? null,
      validFrom: data.validFrom ?? null,
      validTo: data.validTo ?? null,
    },
  });
}

export async function updatePersonSkill(
  id: string,
  data: {
    level?: SkillLevel | null;
    evidence?: string | null;
    validFrom?: Date | null;
    validTo?: Date | null;
    personaId?: string | null;
  },
) {
  return prisma.personSkill.update({
    where: { id },
    data,
  });
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
  personaId?: string | null;
  eventType: SkillEventType;
  level?: SkillLevel | null;
  notes?: string | null;
  date?: Date | null;
  datePrecision?: string;
}) {
  return prisma.personSkillEvent.create({
    data: {
      personSkillId: data.personSkillId,
      personaId: data.personaId ?? null,
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
      persona: { select: { label: true, date: true } },
      personSkill: { select: { id: true, name: true } },
      media: {
        include: { mediaItem: { select: { id: true, variants: true, fileRef: true, originalWidth: true, originalHeight: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Sort by event date, then persona date, then createdAt
  const sorted = [...events].sort((a, b) => {
    const aDate = a.date ?? a.persona?.date ?? a.createdAt;
    const bDate = b.date ?? b.persona?.date ?? b.createdAt;
    return aDate.getTime() - bDate.getTime();
  });

  return sorted.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    level: e.level,
    notes: e.notes,
    date: e.date,
    datePrecision: e.datePrecision,
    personaLabel: e.persona?.label ?? null,
    personaDate: e.persona?.date ?? null,
    media: mapEventMedia(e.media),
    skillName: e.personSkill.name,
    skillId: e.personSkill.id,
  }));
}

// ─── Session Participant Skills ──────────────────────────────────────────────

export async function getSessionParticipantSkills(sessionId: string) {
  return prisma.sessionParticipantSkill.findMany({
    where: { sessionId },
    include: {
      person: {
        include: {
          aliases: {
            where: { type: "common" },
            take: 1,
          },
        },
      },
      skillDefinition: {
        include: { group: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function addSessionParticipantSkill(
  sessionId: string,
  personId: string,
  skillDefinitionId: string,
  notes?: string | null,
) {
  return prisma.$transaction(async (tx) => {
    // 1. Create the session participant skill
    const sps = await tx.sessionParticipantSkill.create({
      data: {
        sessionId,
        personId,
        skillDefinitionId,
        notes: notes ?? null,
      },
    });

    // 2. Find baseline persona (needed for PersonSkill + event)
    const baselinePersona = await tx.persona.findFirst({
      where: { personId, isBaseline: true },
    });
    if (!baselinePersona) return sps;

    // 3. Find or create PersonSkill (linked to baseline persona)
    let personSkill = await tx.personSkill.findFirst({
      where: { personId, skillDefinitionId },
    });

    if (!personSkill) {
      const def = await tx.skillDefinition.findUnique({
        where: { id: skillDefinitionId },
        include: { group: { select: { name: true } } },
      });
      personSkill = await tx.personSkill.create({
        data: {
          personId,
          personaId: baselinePersona.id,
          skillDefinitionId,
          name: def?.name ?? "",
          category: def?.group.name ?? null,
        },
      });
    } else if (!personSkill.personaId) {
      // Backfill personaId if missing (from earlier auto-creates)
      personSkill = await tx.personSkill.update({
        where: { id: personSkill.id },
        data: { personaId: baselinePersona.id },
      });
    }

    // 4. Create DEMONSTRATED event with session date
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      select: { name: true, date: true, datePrecision: true },
    });

    await tx.personSkillEvent.create({
      data: {
        personSkillId: personSkill.id,
        personaId: baselinePersona.id,
        eventType: "DEMONSTRATED",
        date: session?.date ?? null,
        datePrecision: session?.datePrecision ?? "UNKNOWN",
        notes: `[session:${sessionId}] Demonstrated in session: ${session?.name ?? "Unknown"}`,
      },
    });

    return sps;
  });
}

export async function removeSessionParticipantSkill(
  sessionId: string,
  personId: string,
  skillDefinitionId: string,
) {
  return prisma.$transaction(async (tx) => {
    // 1. Delete the session participant skill
    const result = await tx.sessionParticipantSkill.delete({
      where: {
        sessionId_personId_skillDefinitionId: {
          sessionId,
          personId,
          skillDefinitionId,
        },
      },
    });

    // 2. Find the PersonSkill for this person + definition
    const personSkill = await tx.personSkill.findFirst({
      where: { personId, skillDefinitionId },
    });

    if (personSkill) {
      // 3. Find the auto-created DEMONSTRATED event for this session
      const event = await tx.personSkillEvent.findFirst({
        where: {
          personSkillId: personSkill.id,
          eventType: "DEMONSTRATED",
          notes: { contains: `[session:${sessionId}]` },
        },
        orderBy: { createdAt: "desc" },
      });

      if (event) {
        // 4. Delete media links, then delete the event
        await tx.skillEventMedia.deleteMany({ where: { skillEventId: event.id } });
        await tx.personSkillEvent.delete({
          where: { id: event.id },
        });
      }
    }

    return result;
  });
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
      sortOrder: row.sortOrder,
      isCover: false,
    };
  });
}
