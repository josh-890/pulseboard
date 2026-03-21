import { prisma } from "@/lib/db";
import type {
  PersonWithCommonAlias,
  PersonWorkHistoryItem,
  PersonAffiliation,
  PersonConnection,
  BodyMarkWithEvents,
  PersonDigitalIdentityItem,
  PersonSkillItem,
  PersonCurrentState,
  SkillEventMediaThumb,
  PhotoVariants,
  PersonSessionWorkEntry,
  PersonProductionSession,
  SessionThumbnail,
} from "@/lib/types";
import type { PersonStatus, Prisma } from "@/generated/prisma/client";
import { expandRegionFilter } from "@/lib/constants/body-regions";
import type { CreatePersonInput, UpdatePersonInput } from "@/lib/validations/person";
import {
  cascadeDeleteSession,
  cascadeDeleteBodyModifications,
  cascadeDeleteCosmeticProcedures,
  cascadeDeletePersonExtras,
  cascadeDeleteRelationshipEvents,
  cascadeDeletePersonSkills,
} from "@/lib/services/cascade-helpers";

import { buildUrl } from "@/lib/media-url";

function mapSkillEventMedia(
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

/** Shared Prisma include fragment for skill events with media */
const skillEventInclude = {
  persona: { select: { label: true, date: true } },
  media: {
    include: { mediaItem: { select: { id: true, variants: true, fileRef: true, originalWidth: true, originalHeight: true } } },
    orderBy: { sortOrder: "asc" as const },
  },
};

export type PersonSort =
  | "name-asc"
  | "name-desc"
  | "newest"
  | "oldest"
  | "age-asc"
  | "age-desc"
  | "rating-desc"
  | "updated";

export type PersonFilters = {
  q?: string;
  status?: PersonStatus | "all";
  naturalHairColor?: string;
  bodyType?: string;
  ethnicity?: string;
  bodyRegions?: string[];
  bodyRegionMatch?: "any" | "all";
  sort?: PersonSort;
};

export async function getPersons(filters: PersonFilters = {}): Promise<PersonWithCommonAlias[]> {
  const { q, status, naturalHairColor, bodyType, ethnicity } = filters;

  const where: Prisma.PersonWhereInput = {};

  if (status && status !== "all") {
    where.status = status;
  }

  if (naturalHairColor) {
    where.naturalHairColor = { equals: naturalHairColor, mode: "insensitive" };
  }

  if (bodyType) {
    where.bodyType = { equals: bodyType, mode: "insensitive" };
  }

  if (ethnicity) {
    where.ethnicity = { equals: ethnicity, mode: "insensitive" };
  }

  if (q) {
    where.OR = [
      { icgId: { contains: q, mode: "insensitive" } },
      {
        aliases: {
          some: {
            name: { contains: q, mode: "insensitive" },
          },
        },
      },
    ];
  }

  const persons = await prisma.person.findMany({
    where,
    include: {
      aliases: {
        where: { type: { in: ["common", "birth"] } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return persons.map((p) => ({
    id: p.id,
    icgId: p.icgId,
    status: p.status,
    rating: p.rating,
    tags: p.tags,
    naturalHairColor: p.naturalHairColor,
    bodyType: p.bodyType,
    ethnicity: p.ethnicity,
    location: p.location,
    activeSince: p.activeSince,
    specialization: p.specialization,
    createdAt: p.createdAt,
    commonAlias: p.aliases.find((a) => a.type === "common")?.name ?? null,
    birthdate: p.birthdate,
    nationality: p.nationality,
    birthAlias: p.aliases.find((a) => a.type === "birth")?.name ?? null,
  }));
}

export async function getPersonById(id: string) {
  return prisma.person.findUnique({ where: { id } });
}

export async function getPersonWithDetails(id: string) {
  return prisma.person.findUnique({
    where: { id },
    include: {
      aliases: {
        orderBy: [{ type: "asc" }, { name: "asc" }],
      },
      personas: {
        orderBy: [{ isBaseline: "desc" }, { date: "asc" }],
        include: {
          physicalChange: true,
          bodyMarkEvents: {
            include: { bodyMark: true },
          },
          bodyModificationEvents: {
            include: { bodyModification: true },
          },
          cosmeticProcedureEvents: {
            include: { cosmeticProcedure: true },
          },
          digitalIdentities: true,
        },
      },
      bodyMarks: true,
      bodyModifications: true,
      cosmeticProcedures: true,
      skills: {
        include: {
          persona: { select: { label: true } },
          skillDefinition: {
            include: { group: { select: { name: true } } },
          },
          events: {
            include: skillEventInclude,
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
}

export async function getPersonBodyMarks(personId: string): Promise<BodyMarkWithEvents[]> {
  const marks = await prisma.bodyMark.findMany({
    where: { personId },
    include: {
      events: {
        include: {
          persona: { select: { id: true, label: true, date: true, datePrecision: true, isBaseline: true } },
        },
        orderBy: { persona: { date: "asc" } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return marks.map((m) => {
    const events = m.events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      notes: e.notes,
      persona: { id: e.persona.id, label: e.persona.label, date: e.persona.date, datePrecision: e.persona.datePrecision, isBaseline: e.persona.isBaseline },
      bodyRegions: e.bodyRegions ?? [],
      motif: e.motif ?? null,
      colors: e.colors ?? [],
      size: e.size ?? null,
      description: e.description ?? null,
    }));
    return {
      id: m.id, type: m.type, bodyRegion: m.bodyRegion, bodyRegions: m.bodyRegions,
      side: m.side, position: m.position, description: m.description,
      motif: m.motif, colors: m.colors, size: m.size, status: m.status,
      events,
      computed: foldBodyMarkState(m, events),
    };
  });
}

export async function createBodyMarkRecord(data: import("@/lib/validations/body-mark").CreateBodyMarkInput) {
  return prisma.bodyMark.create({ data });
}

export async function updateBodyMarkRecord(id: string, data: Omit<import("@/lib/validations/body-mark").UpdateBodyMarkInput, "id">) {
  return prisma.bodyMark.update({ where: { id }, data });
}

export async function deleteBodyMarkRecord(id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.bodyMarkEvent.deleteMany({ where: { bodyMarkId: id } });
    await tx.personMediaLink.deleteMany({ where: { bodyMarkId: id } });
    return tx.bodyMark.delete({ where: { id } });
  });
}

export async function createBodyMarkEventRecord(data: import("@/lib/validations/body-mark").CreateBodyMarkEventInput) {
  return prisma.bodyMarkEvent.create({ data });
}

export async function deleteBodyMarkEventRecord(id: string) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.bodyMarkEvent.delete({ where: { id } });
    const remaining = await tx.bodyMarkEvent.count({
      where: { bodyMarkId: event.bodyMarkId },
    });
    if (remaining === 0) {
      await tx.personMediaLink.deleteMany({ where: { bodyMarkId: event.bodyMarkId } });
      await tx.bodyMark.delete({ where: { id: event.bodyMarkId } });
    }
    return event;
  });
}

export async function getPersonDigitalIdentities(personId: string): Promise<PersonDigitalIdentityItem[]> {
  const identities = await prisma.personDigitalIdentity.findMany({
    where: { personId },
    include: { persona: { select: { label: true } } },
    orderBy: { validFrom: "asc" },
  });

  return identities.map((i) => ({
    id: i.id,
    platform: i.platform,
    handle: i.handle,
    url: i.url,
    status: i.status,
    validFrom: i.validFrom,
    validTo: i.validTo,
    personaLabel: i.persona?.label ?? null,
  }));
}

export async function getPersonSkills(personId: string): Promise<PersonSkillItem[]> {
  const skills = await prisma.personSkill.findMany({
    where: { personId },
    include: {
      persona: { select: { label: true } },
      skillDefinition: {
        include: { group: { select: { name: true } } },
      },
      events: {
        include: skillEventInclude,
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
    definitionDescription: s.skillDefinition?.description ?? null,
    definitionPgrade: s.skillDefinition?.pgrade ?? null,
    events: s.events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      level: e.level,
      notes: e.notes,
      date: e.date,
      datePrecision: e.datePrecision,
      personaLabel: e.persona?.label ?? null,
      personaDate: e.persona?.date ?? null,
      media: mapSkillEventMedia(e.media),
    })),
  }));
}

export async function computePersonCurrentState(personId: string): Promise<PersonCurrentState> {
  const [allPersonas, bodyMarks, digitalIdentities, skills] = await Promise.all([
    prisma.persona.findMany({
      where: { personId },
      orderBy: [{ isBaseline: "desc" }, { date: "asc" }],
      include: { physicalChange: true },
    }),
    getPersonBodyMarks(personId),
    getPersonDigitalIdentities(personId),
    getPersonSkills(personId),
  ]);

  // Fold physical changes: later personas win
  let currentHairColor: string | null = null;
  let weight: number | null = null;
  let build: string | null = null;
  let visionAids: string | null = null;
  let fitnessLevel: string | null = null;

  for (const persona of allPersonas) {
    if (persona.physicalChange) {
      const p = persona.physicalChange;
      if (p.currentHairColor !== null) currentHairColor = p.currentHairColor;
      if (p.weight !== null) weight = p.weight;
      if (p.build !== null) build = p.build;
      if (p.visionAids !== null) visionAids = p.visionAids;
      if (p.fitnessLevel !== null) fitnessLevel = p.fitnessLevel;
    }
  }

  const now = new Date();

  const activeBodyMarks = bodyMarks;

  // Active digital identities: status = active, no validTo or validTo in future
  const activeDigitalIdentities = digitalIdentities.filter((i) => {
    if (i.status !== "active") return false;
    if (i.validTo && i.validTo <= now) return false;
    return true;
  });

  // Active skills: no validTo or validTo in future
  const activeSkills = skills.filter((s) => {
    if (s.validTo && s.validTo <= now) return false;
    return true;
  });

  return {
    currentHairColor,
    weight,
    build,
    visionAids,
    fitnessLevel,
    activeBodyMarks,
    activeBodyModifications: [],
    activeCosmeticProcedures: [],
    activeDigitalIdentities,
    activeSkills,
  };
}

export async function getPersonWorkHistory(personId: string): Promise<PersonWorkHistoryItem[]> {
  const participants = await prisma.setParticipant.findMany({
    where: { personId },
    include: {
      roleDefinition: true,
      set: {
        include: {
          channel: {
            include: { labelMaps: { include: { label: true } } },
          },
        },
      },
    },
  });

  return participants
    .sort((a, b) => {
      const aDate = a.set.releaseDate?.getTime() ?? 0;
      const bDate = b.set.releaseDate?.getTime() ?? 0;
      return bDate - aDate;
    })
    .map((p) => ({
      setId: p.set.id,
      setTitle: p.set.title,
      setType: p.set.type,
      role: p.roleDefinition.name,
      releaseDate: p.set.releaseDate,
      releaseDatePrecision: p.set.releaseDatePrecision,
      channelName: p.set.channel?.name ?? null,
      labelId: p.set.channel?.labelMaps[0]?.label.id ?? null,
      labelName: p.set.channel?.labelMaps[0]?.label.name ?? null,
    }));
}

function buildSessionThumbnails(
  mediaItems: { id: string; variants: unknown; fileRef: string | null; originalWidth: number; originalHeight: number }[],
  limit: number,
): SessionThumbnail[] {
  const results: SessionThumbnail[] = [];
  for (const item of mediaItems) {
    if (results.length >= limit) break;
    const variants = (item.variants ?? {}) as PhotoVariants;
    const url = variants.gallery_512
      ? buildUrl(variants.gallery_512)
      : variants.original
        ? buildUrl(variants.original)
        : item.fileRef
          ? buildUrl(item.fileRef)
          : null;
    if (url) {
      results.push({ id: item.id, url, width: item.originalWidth, height: item.originalHeight });
    }
  }
  return results;
}

export async function getPersonSessionWorkHistory(personId: string): Promise<PersonSessionWorkEntry[]> {
  const contributions = await prisma.sessionContribution.findMany({
    where: {
      personId,
      session: { type: "PRODUCTION" },
    },
    include: {
      roleDefinition: { select: { name: true } },
      session: {
        include: {
          label: { select: { id: true, name: true } },
          mediaItems: {
            take: 6,
            orderBy: { createdAt: "asc" },
            select: { id: true, variants: true, fileRef: true, originalWidth: true, originalHeight: true },
          },
          _count: { select: { mediaItems: true } },
          setSessionLinks: {
            include: {
              set: {
                include: {
                  channel: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  // Group by sessionId to merge multiple roles
  const sessionMap = new Map<string, PersonSessionWorkEntry>();
  for (const c of contributions) {
    const s = c.session;
    const existing = sessionMap.get(s.id);
    if (existing) {
      if (!existing.roles.includes(c.roleDefinition.name)) {
        existing.roles.push(c.roleDefinition.name);
      }
    } else {
      sessionMap.set(s.id, {
        sessionId: s.id,
        sessionName: s.name,
        sessionDate: s.date,
        sessionDatePrecision: s.datePrecision,
        labelId: s.label?.id ?? null,
        labelName: s.label?.name ?? null,
        roles: [c.roleDefinition.name],
        mediaCount: s._count.mediaItems,
        thumbnails: buildSessionThumbnails(s.mediaItems, 6),
        linkedSets: s.setSessionLinks.map((link) => ({
          setId: link.set.id,
          title: link.set.title,
          type: link.set.type,
          releaseDate: link.set.releaseDate,
          releaseDatePrecision: link.set.releaseDatePrecision,
          channelName: link.set.channel?.name ?? null,
        })),
      });
    }
  }

  return Array.from(sessionMap.values()).sort((a, b) => {
    const aTime = a.sessionDate?.getTime() ?? 0;
    const bTime = b.sessionDate?.getTime() ?? 0;
    return bTime - aTime;
  });
}

export async function getPersonProductionSessions(personId: string): Promise<PersonProductionSession[]> {
  const contributions = await prisma.sessionContribution.findMany({
    where: {
      personId,
      session: { type: "PRODUCTION" },
    },
    include: {
      roleDefinition: { select: { name: true } },
      session: {
        include: {
          label: { select: { name: true } },
          mediaItems: {
            take: 3,
            orderBy: { createdAt: "asc" },
            select: { id: true, variants: true, fileRef: true, originalWidth: true, originalHeight: true },
          },
          _count: { select: { mediaItems: true } },
        },
      },
    },
  });

  const sessionMap = new Map<string, PersonProductionSession>();
  for (const c of contributions) {
    const s = c.session;
    const existing = sessionMap.get(s.id);
    if (existing) {
      if (!existing.roles.includes(c.roleDefinition.name)) {
        existing.roles.push(c.roleDefinition.name);
      }
    } else {
      sessionMap.set(s.id, {
        sessionId: s.id,
        sessionName: s.name,
        sessionDate: s.date,
        sessionDatePrecision: s.datePrecision,
        labelName: s.label?.name ?? null,
        roles: [c.roleDefinition.name],
        mediaCount: s._count.mediaItems,
        previewThumbnails: buildSessionThumbnails(s.mediaItems, 3),
      });
    }
  }

  return Array.from(sessionMap.values()).sort((a, b) => {
    const aTime = a.sessionDate?.getTime() ?? 0;
    const bTime = b.sessionDate?.getTime() ?? 0;
    return bTime - aTime;
  });
}

// ─── Event-carried state fold helpers ────────────────────────────────────────

function foldBodyMarkState(
  base: { bodyRegions: string[]; motif: string | null; colors: string[]; size: string | null; description: string | null },
  events: { bodyRegions: string[]; motif: string | null; colors: string[]; size: string | null; description: string | null }[],
) {
  const result = { bodyRegions: base.bodyRegions, motif: base.motif, colors: base.colors, size: base.size, description: base.description };
  for (const e of events) {
    if (e.bodyRegions.length > 0) result.bodyRegions = e.bodyRegions;
    if (e.motif !== null) result.motif = e.motif;
    if (e.colors.length > 0) result.colors = e.colors;
    if (e.size !== null) result.size = e.size;
    if (e.description !== null) result.description = e.description;
  }
  return result;
}

function foldBodyModificationState(
  base: { bodyRegions: string[]; description: string | null; material: string | null; gauge: string | null },
  events: { bodyRegions: string[]; description: string | null; material: string | null; gauge: string | null }[],
) {
  const result = { bodyRegions: base.bodyRegions, description: base.description, material: base.material, gauge: base.gauge };
  for (const e of events) {
    if (e.bodyRegions.length > 0) result.bodyRegions = e.bodyRegions;
    if (e.description !== null) result.description = e.description;
    if (e.material !== null) result.material = e.material;
    if (e.gauge !== null) result.gauge = e.gauge;
  }
  return result;
}

function foldCosmeticProcedureState(
  base: { bodyRegions: string[]; description: string | null; provider: string | null },
  events: { bodyRegions: string[]; description: string | null; provider: string | null }[],
) {
  const result = { bodyRegions: base.bodyRegions, description: base.description, provider: base.provider };
  for (const e of events) {
    if (e.bodyRegions.length > 0) result.bodyRegions = e.bodyRegions;
    if (e.description !== null) result.description = e.description;
    if (e.provider !== null) result.provider = e.provider;
  }
  return result;
}

/**
 * Derives current physical state from an already-loaded person with details.
 * Pure sync function — no DB access. Replaces the async `computePersonCurrentState`.
 */
export function deriveCurrentState(
  person: NonNullable<Awaited<ReturnType<typeof getPersonWithDetails>>>,
): PersonCurrentState {
  let currentHairColor: string | null = null;
  let weight: number | null = null;
  let build: string | null = null;
  let visionAids: string | null = null;
  let fitnessLevel: string | null = null;

  for (const persona of person.personas) {
    if (persona.physicalChange) {
      const p = persona.physicalChange;
      if (p.currentHairColor !== null) currentHairColor = p.currentHairColor;
      if (p.weight !== null) weight = p.weight;
      if (p.build !== null) build = p.build;
      if (p.visionAids !== null) visionAids = p.visionAids;
      if (p.fitnessLevel !== null) fitnessLevel = p.fitnessLevel;
    }
  }

  const now = new Date();

  // ── Body Marks ──
  const activeBodyMarks: BodyMarkWithEvents[] = [];
  const seenMarkIds = new Set<string>();
  for (const persona of person.personas) {
    for (const event of persona.bodyMarkEvents) {
      if (seenMarkIds.has(event.bodyMark.id)) continue;
      seenMarkIds.add(event.bodyMark.id);
      const mark = event.bodyMark;
      const allEvents: import("@/lib/types").BodyMarkEventItem[] = person.personas.flatMap((p) =>
        p.bodyMarkEvents
          .filter((e) => e.bodyMark.id === mark.id)
          .map((e) => ({
            id: e.id,
            eventType: e.eventType,
            notes: e.notes,
            persona: { id: p.id, label: p.label, date: p.date, datePrecision: p.datePrecision, isBaseline: p.isBaseline },
            bodyRegions: e.bodyRegions ?? [],
            motif: e.motif ?? null,
            colors: e.colors ?? [],
            size: e.size ?? null,
            description: e.description ?? null,
          })),
      );
      activeBodyMarks.push({
        id: mark.id, type: mark.type, bodyRegion: mark.bodyRegion, bodyRegions: mark.bodyRegions,
        side: mark.side, position: mark.position, description: mark.description,
        motif: mark.motif, colors: mark.colors, size: mark.size, status: mark.status,
        events: allEvents,
        computed: foldBodyMarkState(mark, allEvents),
      });
    }
  }
  for (const mark of person.bodyMarks) {
    if (seenMarkIds.has(mark.id)) continue;
    activeBodyMarks.push({
      id: mark.id, type: mark.type, bodyRegion: mark.bodyRegion, bodyRegions: mark.bodyRegions,
      side: mark.side, position: mark.position, description: mark.description,
      motif: mark.motif, colors: mark.colors, size: mark.size, status: mark.status,
      events: [],
      computed: { bodyRegions: mark.bodyRegions, motif: mark.motif, colors: mark.colors, size: mark.size, description: mark.description },
    });
  }

  // ── Body Modifications ──
  const activeBodyModifications: import("@/lib/types").BodyModificationWithEvents[] = [];
  const seenModIds = new Set<string>();
  for (const persona of person.personas) {
    for (const event of persona.bodyModificationEvents) {
      if (seenModIds.has(event.bodyModification.id)) continue;
      seenModIds.add(event.bodyModification.id);
      const mod = event.bodyModification;
      const allEvents: import("@/lib/types").BodyModificationEventItem[] = person.personas.flatMap((p) =>
        p.bodyModificationEvents
          .filter((e) => e.bodyModification.id === mod.id)
          .map((e) => ({
            id: e.id,
            eventType: e.eventType,
            notes: e.notes,
            persona: { id: p.id, label: p.label, date: p.date, datePrecision: p.datePrecision, isBaseline: p.isBaseline },
            bodyRegions: e.bodyRegions ?? [],
            description: e.description ?? null,
            material: e.material ?? null,
            gauge: e.gauge ?? null,
          })),
      );
      activeBodyModifications.push({
        id: mod.id, type: mod.type, bodyRegion: mod.bodyRegion, bodyRegions: mod.bodyRegions,
        side: mod.side, position: mod.position, description: mod.description,
        material: mod.material, gauge: mod.gauge, status: mod.status,
        events: allEvents,
        computed: foldBodyModificationState(mod, allEvents),
      });
    }
  }
  for (const mod of person.bodyModifications) {
    if (seenModIds.has(mod.id)) continue;
    activeBodyModifications.push({
      id: mod.id, type: mod.type, bodyRegion: mod.bodyRegion, bodyRegions: mod.bodyRegions,
      side: mod.side, position: mod.position, description: mod.description,
      material: mod.material, gauge: mod.gauge, status: mod.status,
      events: [],
      computed: { bodyRegions: mod.bodyRegions, description: mod.description, material: mod.material, gauge: mod.gauge },
    });
  }

  // ── Cosmetic Procedures ──
  const activeCosmeticProcedures: import("@/lib/types").CosmeticProcedureWithEvents[] = [];
  const seenProcIds = new Set<string>();
  for (const persona of person.personas) {
    for (const event of persona.cosmeticProcedureEvents) {
      if (seenProcIds.has(event.cosmeticProcedure.id)) continue;
      seenProcIds.add(event.cosmeticProcedure.id);
      const proc = event.cosmeticProcedure;
      const allEvents: import("@/lib/types").CosmeticProcedureEventItem[] = person.personas.flatMap((p) =>
        p.cosmeticProcedureEvents
          .filter((e) => e.cosmeticProcedure.id === proc.id)
          .map((e) => ({
            id: e.id,
            eventType: e.eventType,
            notes: e.notes,
            persona: { id: p.id, label: p.label, date: p.date, datePrecision: p.datePrecision, isBaseline: p.isBaseline },
            bodyRegions: e.bodyRegions ?? [],
            description: e.description ?? null,
            provider: e.provider ?? null,
          })),
      );
      activeCosmeticProcedures.push({
        id: proc.id, type: proc.type, bodyRegion: proc.bodyRegion, bodyRegions: proc.bodyRegions,
        description: proc.description, provider: proc.provider, status: proc.status,
        events: allEvents,
        computed: foldCosmeticProcedureState(proc, allEvents),
      });
    }
  }
  for (const proc of person.cosmeticProcedures) {
    if (seenProcIds.has(proc.id)) continue;
    activeCosmeticProcedures.push({
      id: proc.id, type: proc.type, bodyRegion: proc.bodyRegion, bodyRegions: proc.bodyRegions,
      description: proc.description, provider: proc.provider, status: proc.status,
      events: [],
      computed: { bodyRegions: proc.bodyRegions, description: proc.description, provider: proc.provider },
    });
  }

  const activeDigitalIdentities: PersonDigitalIdentityItem[] = [];
  for (const persona of person.personas) {
    for (const i of persona.digitalIdentities) {
      if (i.status !== "active") continue;
      if (i.validTo && i.validTo <= now) continue;
      activeDigitalIdentities.push({
        id: i.id,
        platform: i.platform,
        handle: i.handle,
        url: i.url,
        status: i.status,
        validFrom: i.validFrom,
        validTo: i.validTo,
        personaLabel: persona.label,
      });
    }
  }

  const activeSkills: PersonSkillItem[] = [];
  for (const s of person.skills) {
    if (s.validTo && s.validTo <= now) continue;
    activeSkills.push({
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
      definitionDescription: s.skillDefinition?.description ?? null,
      definitionPgrade: s.skillDefinition?.pgrade ?? null,
      events: s.events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        level: e.level,
        notes: e.notes,
        date: e.date,
        datePrecision: e.datePrecision,
        personaLabel: e.persona?.label ?? null,
        personaDate: e.persona?.date ?? null,
        media: "media" in e ? mapSkillEventMedia(e.media as Parameters<typeof mapSkillEventMedia>[0]) : [],
      })),
    });
  }

  return {
    currentHairColor,
    weight,
    build,
    visionAids,
    fitnessLevel,
    activeBodyMarks,
    activeBodyModifications,
    activeCosmeticProcedures,
    activeDigitalIdentities,
    activeSkills,
  };
}

/**
 * Derives label affiliations from already-loaded work history items.
 * Pure sync function — no DB access. Replaces the async `getPersonAffiliations`.
 */
export function deriveAffiliations(workHistory: PersonWorkHistoryItem[]): PersonAffiliation[] {
  const labelMap = new Map<string, PersonAffiliation>();
  for (const item of workHistory) {
    if (!item.labelId || !item.labelName) continue;
    const existing = labelMap.get(item.labelId);
    if (existing) {
      existing.setCount++;
    } else {
      labelMap.set(item.labelId, {
        labelId: item.labelId,
        labelName: item.labelName,
        setCount: 1,
      });
    }
  }
  return Array.from(labelMap.values()).sort((a, b) => b.setCount - a.setCount);
}

export async function getPersonAffiliations(personId: string): Promise<PersonAffiliation[]> {
  const participants = await prisma.setParticipant.findMany({
    where: { personId },
    include: {
      set: {
        include: {
          channel: { include: { labelMaps: { include: { label: true } } } },
        },
      },
    },
  });

  const labelMap = new Map<string, PersonAffiliation>();
  for (const p of participants) {
    const labelMaps = p.set.channel?.labelMaps ?? [];
    for (const lm of labelMaps) {
      const label = lm.label;
      const existing = labelMap.get(label.id);
      if (existing) {
        existing.setCount++;
      } else {
        labelMap.set(label.id, {
          labelId: label.id,
          labelName: label.name,
          setCount: 1,
        });
      }
    }
  }

  return Array.from(labelMap.values()).sort((a, b) => b.setCount - a.setCount);
}

export async function getPersonConnections(personId: string): Promise<PersonConnection[]> {
  const relationships = await prisma.personRelationship.findMany({
    where: {
      OR: [{ personAId: personId }, { personBId: personId }],
    },
    include: {
      personA: {
        include: {
          aliases: { where: { type: "common" as const }, take: 1 },
        },
      },
      personB: {
        include: {
          aliases: { where: { type: "common" as const }, take: 1 },
        },
      },
    },
    orderBy: { sharedSetCount: "desc" },
  });

  return relationships
    .map((r) => {
      const other = r.personAId === personId ? r.personB : r.personA;
      return {
        personId: other.id,
        icgId: other.icgId,
        commonAlias: other.aliases[0]?.name ?? null,
        sharedSetCount: r.sharedSetCount,
        source: r.source,
        label: r.label,
      };
    });
}

export async function countPersons(): Promise<number> {
  return prisma.person.count();
}

export async function createPersonRecord(data: CreatePersonInput) {
  return prisma.$transaction(async (tx) => {
    const person = await tx.person.create({
      data: {
        icgId: data.icgId,
        status: data.status,
        sexAtBirth: data.sexAtBirth,
        birthdate: data.birthdate ? new Date(data.birthdate) : undefined,
        birthdatePrecision: data.birthdatePrecision ?? "UNKNOWN",
        birthPlace: data.birthPlace,
        nationality: data.nationality,
        ethnicity: data.ethnicity,
        eyeColor: data.eyeColor,
        naturalHairColor: data.naturalHairColor,
        height: data.height,
      },
    });

    await tx.personAlias.create({
      data: { personId: person.id, name: data.commonName, type: "common" },
    });

    if (data.birthName) {
      await tx.personAlias.create({
        data: { personId: person.id, name: data.birthName, type: "birth" },
      });
    }

    const persona = await tx.persona.create({
      data: {
        personId: person.id,
        label: data.personaLabel,
        isBaseline: true,
        date: new Date(),
      },
    });

    const hasPhysical =
      data.weight !== undefined ||
      data.build !== undefined ||
      data.currentHairColor !== undefined ||
      data.visionAids !== undefined ||
      data.fitnessLevel !== undefined;

    if (hasPhysical) {
      await tx.personaPhysical.create({
        data: {
          personaId: persona.id,
          weight: data.weight,
          build: data.build,
          currentHairColor: data.currentHairColor,
          visionAids: data.visionAids,
          fitnessLevel: data.fitnessLevel,
        },
      });
    }

    // Auto-create REFERENCE session for this person
    const displayName = data.commonName || data.icgId;
    await tx.session.create({
      data: {
        name: `${displayName} — Reference`,
        nameNorm: `${displayName.toLowerCase()} — reference`,
        type: "REFERENCE",
        status: "CONFIRMED",
        personId: person.id,
      },
    });

    return person;
  });
}

export async function updatePersonRecord(id: string, data: UpdatePersonInput) {
  return prisma.$transaction(async (tx) => {
    await tx.person.update({
      where: { id },
      data: {
        status: data.status,
        sexAtBirth: data.sexAtBirth,
        birthdate: data.birthdate ? new Date(data.birthdate) : null,
        birthdatePrecision: data.birthdatePrecision ?? "UNKNOWN",
        birthPlace: data.birthPlace,
        nationality: data.nationality,
        ethnicity: data.ethnicity,
        eyeColor: data.eyeColor,
        naturalHairColor: data.naturalHairColor,
        height: data.height,
        location: data.location,
        notes: data.notes,
        activeSince: data.activeSince,
        specialization: data.specialization,
        rating: data.rating,
        pgrade: data.pgrade,
      },
    });

    // Update common alias if provided
    if (data.commonName !== undefined) {
      const commonAlias = await tx.personAlias.findFirst({
        where: { personId: id, type: "common" },
      });
      if (commonAlias) {
        await tx.personAlias.update({
          where: { id: commonAlias.id },
          data: { name: data.commonName },
        });
      }
    }

    // Upsert PersonaPhysical on baseline persona
    const hasPhysical =
      data.weight !== undefined ||
      data.build !== undefined ||
      data.currentHairColor !== undefined ||
      data.visionAids !== undefined ||
      data.fitnessLevel !== undefined;

    if (hasPhysical) {
      const baselinePersona = await tx.persona.findFirst({
        where: { personId: id, isBaseline: true },
      });
      if (baselinePersona) {
        await tx.personaPhysical.upsert({
          where: { personaId: baselinePersona.id },
          create: {
            personaId: baselinePersona.id,
            weight: data.weight,
            build: data.build,
            currentHairColor: data.currentHairColor,
            visionAids: data.visionAids,
            fitnessLevel: data.fitnessLevel,
          },
          update: {
            weight: data.weight ?? null,
            build: data.build ?? null,
            currentHairColor: data.currentHairColor ?? null,
            visionAids: data.visionAids ?? null,
            fitnessLevel: data.fitnessLevel ?? null,
          },
        });
      }
    }
  });
}

export async function deletePersonRecord(id: string) {
  return prisma.$transaction(async (tx) => {
    // Delete alias channel links, then aliases
    const aliasIds = (await tx.personAlias.findMany({
      where: { personId: id },
      select: { id: true },
    })).map((a) => a.id);
    if (aliasIds.length > 0) {
      await tx.personAliasChannel.deleteMany({
        where: { aliasId: { in: aliasIds } },
      });
    }
    await tx.personAlias.deleteMany({
      where: { personId: id },
    });

    // Fetch persona IDs for cascading
    const personas = await tx.persona.findMany({
      where: { personId: id },
      select: { id: true },
    });
    const personaIds = personas.map((p) => p.id);

    if (personaIds.length > 0) {
      // Delete PersonaPhysical
      await tx.personaPhysical.deleteMany({
        where: { personaId: { in: personaIds } },
      });

      // Delete body mark events via personaId
      await tx.bodyMarkEvent.deleteMany({
        where: { personaId: { in: personaIds } },
      });

      // Delete personas
      await tx.persona.deleteMany({
        where: { id: { in: personaIds } },
      });
    }

    // Delete body marks
    await tx.bodyMark.deleteMany({
      where: { personId: id },
    });

    // Delete body modifications + events
    await cascadeDeleteBodyModifications(tx, id, personaIds);

    // Delete cosmetic procedures + events
    await cascadeDeleteCosmeticProcedures(tx, id, personaIds);

    // Delete education, awards, interests
    await cascadeDeletePersonExtras(tx, id);

    // Delete digital identities
    await tx.personDigitalIdentity.deleteMany({
      where: { personId: id },
    });

    // Delete skills + events, contribution skills
    await cascadeDeletePersonSkills(tx, id);

    // Delete session contributions (skills already cascaded above)
    await tx.sessionContribution.deleteMany({
      where: { personId: id },
    });

    // Delete set participants
    await tx.setParticipant.deleteMany({
      where: { personId: id },
    });

    // Delete relationship events, then relationships
    await cascadeDeleteRelationshipEvents(tx, id);
    await tx.personRelationship.deleteMany({
      where: {
        OR: [{ personAId: id }, { personBId: id }],
      },
    });

    // Cascade-delete the person's reference session (if any)
    const refSession = await tx.session.findFirst({
      where: { personId: id },
    });
    if (refSession) {
      await cascadeDeleteSession(tx, refSession.id);
    }

    // Delete PersonMediaLinks
    await tx.personMediaLink.deleteMany({
      where: { personId: id },
    });

    // Delete the person
    return tx.person.delete({
      where: { id },
    });
  });
}

export type PaginatedPersons = {
  items: PersonWithCommonAlias[];
  nextCursor: string | null;
  totalCount: number;
};

function getPersonOrderBy(sort?: PersonSort): Prisma.PersonOrderByWithRelationInput[] {
  switch (sort) {
    case "name-asc":
    case "name-desc":
      // Name sort handled via raw SQL query path below
      return [{ createdAt: "asc" }];
    case "newest":
      return [{ createdAt: "desc" }];
    case "oldest":
      return [{ createdAt: "asc" }];
    case "age-asc":
      return [{ birthdate: { sort: "desc", nulls: "last" } }];
    case "age-desc":
      return [{ birthdate: { sort: "asc", nulls: "last" } }];
    case "rating-desc":
      return [{ rating: { sort: "desc", nulls: "last" } }];
    case "updated":
      return [{ createdAt: "desc" }]; // Person has no updatedAt — use createdAt
    default:
      return [{ createdAt: "asc" }];
  }
}

export async function getPersonsPaginated(
  filters: PersonFilters = {},
  cursor?: string,
  limit = 50,
): Promise<PaginatedPersons> {
  const { q, status, naturalHairColor, bodyType, ethnicity, bodyRegions, sort } = filters;

  const where: Prisma.PersonWhereInput = {};

  if (status && status !== "all") {
    where.status = status;
  }

  if (naturalHairColor) {
    where.naturalHairColor = { equals: naturalHairColor, mode: "insensitive" };
  }

  if (bodyType) {
    where.bodyType = { equals: bodyType, mode: "insensitive" };
  }

  if (ethnicity) {
    where.ethnicity = { equals: ethnicity, mode: "insensitive" };
  }

  // Body region filter: find persons who have body marks/modifications/procedures
  // in the selected regions. Expands selected IDs to include ancestors and
  // descendants for hierarchical matching (e.g. selecting "arm.upper.outer_l"
  // also matches records stored as "arm_l").
  if (bodyRegions && bodyRegions.length > 0) {
    const expanded = expandRegionFilter(bodyRegions);
    const regionCondition: Prisma.PersonWhereInput = {
      OR: [
        { bodyMarks: { some: { bodyRegions: { hasSome: expanded } } } },
        { bodyModifications: { some: { bodyRegions: { hasSome: expanded } } } },
        { cosmeticProcedures: { some: { bodyRegions: { hasSome: expanded } } } },
      ],
    };
    where.AND = [regionCondition];
  }

  if (q) {
    where.OR = [
      { icgId: { contains: q, mode: "insensitive" } },
      {
        aliases: {
          some: {
            name: { contains: q, mode: "insensitive" },
          },
        },
      },
    ];
  }

  const orderBy = getPersonOrderBy(sort);
  const isNameSort = sort === "name-asc" || sort === "name-desc";

  // For name sort, fetch with aliases ordered by nameNorm
  if (isNameSort) {
    const [totalCount, allPersons] = await Promise.all([
      prisma.person.count({ where }),
      prisma.person.findMany({
        where,
        include: {
          aliases: { where: { type: { in: ["common", "birth"] } } },
        },
      }),
    ]);

    // Sort in-memory by common alias nameNorm
    const direction = sort === "name-asc" ? 1 : -1;
    allPersons.sort((a, b) => {
      const nameA = a.aliases.find((al) => al.type === "common")?.nameNorm ?? "\uffff";
      const nameB = b.aliases.find((al) => al.type === "common")?.nameNorm ?? "\uffff";
      return nameA.localeCompare(nameB) * direction;
    });

    // Find cursor position for pagination
    let startIdx = 0;
    if (cursor) {
      const cursorIdx = allPersons.findIndex((p) => p.id === cursor);
      startIdx = cursorIdx >= 0 ? cursorIdx + 1 : 0;
    }

    const pageItems = allPersons.slice(startIdx, startIdx + limit);
    const hasMore = startIdx + limit < allPersons.length;
    const nextCursorId = hasMore ? pageItems[pageItems.length - 1]!.id : null;

    return {
      items: pageItems.map((p) => ({
        id: p.id,
        icgId: p.icgId,
        status: p.status,
        rating: p.rating,
        tags: p.tags,
        naturalHairColor: p.naturalHairColor,
        bodyType: p.bodyType,
        ethnicity: p.ethnicity,
        location: p.location,
        activeSince: p.activeSince,
        specialization: p.specialization,
        createdAt: p.createdAt,
        commonAlias: p.aliases.find((a) => a.type === "common")?.name ?? null,
        birthdate: p.birthdate,
        nationality: p.nationality,
        birthAlias: p.aliases.find((a) => a.type === "birth")?.name ?? null,
      })),
      nextCursor: nextCursorId,
      totalCount,
    };
  }

  const [totalCount, persons] = await Promise.all([
    prisma.person.count({ where }),
    prisma.person.findMany({
      where,
      include: {
        aliases: {
          where: { type: { in: ["common", "birth"] } },
        },
      },
      orderBy,
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    }),
  ]);

  const hasMore = persons.length > limit;
  const items = hasMore ? persons.slice(0, limit) : persons;
  const nextCursor = hasMore ? items[items.length - 1]!.id : null;

  return {
    items: items.map((p) => ({
      id: p.id,
      icgId: p.icgId,
      status: p.status,
      rating: p.rating,
      tags: p.tags,
      naturalHairColor: p.naturalHairColor,
      bodyType: p.bodyType,
      ethnicity: p.ethnicity,
      location: p.location,
      activeSince: p.activeSince,
      specialization: p.specialization,
      createdAt: p.createdAt,
      commonAlias: p.aliases.find((a) => a.type === "common")?.name ?? null,
      birthdate: p.birthdate,
      nationality: p.nationality,
      birthAlias: p.aliases.find((a) => a.type === "birth")?.name ?? null,
    })),
    nextCursor,
    totalCount,
  };
}

export async function getDistinctNaturalHairColors(): Promise<string[]> {
  const result = await prisma.person.findMany({
    where: { naturalHairColor: { not: null } },
    select: { naturalHairColor: true },
    distinct: ["naturalHairColor"],
    orderBy: { naturalHairColor: "asc" },
  });
  return result.map((r) => r.naturalHairColor!).filter(Boolean);
}

export async function getDistinctBodyTypes(): Promise<string[]> {
  const result = await prisma.person.findMany({
    where: { bodyType: { not: null } },
    select: { bodyType: true },
    distinct: ["bodyType"],
    orderBy: { bodyType: "asc" },
  });
  return result.map((r) => r.bodyType!).filter(Boolean);
}

export async function getDistinctEthnicities(): Promise<string[]> {
  const result = await prisma.person.findMany({
    where: { ethnicity: { not: null } },
    select: { ethnicity: true },
    distinct: ["ethnicity"],
    orderBy: { ethnicity: "asc" },
  });
  return result.map((r) => r.ethnicity!).filter(Boolean);
}
