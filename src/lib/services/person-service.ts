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
} from "@/lib/types";
import type { PersonStatus, Prisma } from "@/generated/prisma/client";
import type { CreatePersonInput, UpdatePersonInput } from "@/lib/validations/person";
import {
  cascadeDeletePhotos,
  cascadeDeleteBodyModifications,
  cascadeDeleteCosmeticProcedures,
  cascadeDeletePersonExtras,
  cascadeDeleteRelationshipEvents,
} from "./cascade-helpers";

export type PersonFilters = {
  q?: string;
  status?: PersonStatus | "all";
  naturalHairColor?: string;
  bodyType?: string;
  ethnicity?: string;
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
            deletedAt: null,
          },
        },
      },
    ];
  }

  const persons = await prisma.person.findMany({
    where,
    include: {
      aliases: {
        where: { deletedAt: null, type: { in: ["common", "birth"] } },
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
        where: { deletedAt: null },
        orderBy: [{ type: "asc" }, { name: "asc" }],
      },
      personas: {
        where: { deletedAt: null },
        orderBy: [{ isBaseline: "desc" }, { date: "asc" }],
        include: {
          physicalChange: true,
          bodyMarkEvents: {
            where: { deletedAt: null },
            include: { bodyMark: true },
          },
          digitalIdentities: {
            where: { deletedAt: null },
          },
          skills: {
            where: { deletedAt: null },
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
        where: { deletedAt: null },
        include: {
          persona: { select: { id: true, label: true, date: true } },
        },
        orderBy: { persona: { date: "asc" } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return marks.map((m) => ({
    id: m.id,
    type: m.type,
    bodyRegion: m.bodyRegion,
    side: m.side,
    position: m.position,
    description: m.description,
    motif: m.motif,
    colors: m.colors,
    size: m.size,
    status: m.status,
    events: m.events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      notes: e.notes,
      persona: { id: e.persona.id, label: e.persona.label, date: e.persona.date },
    })),
  }));
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
    include: { persona: { select: { label: true } } },
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

  // Active body marks: status = present and not soft-deleted
  const activeBodyMarks = bodyMarks.filter((m) => m.status === "present");

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
    activeDigitalIdentities,
    activeSkills,
  };
}

export async function getPersonWorkHistory(personId: string): Promise<PersonWorkHistoryItem[]> {
  const contributions = await prisma.setContribution.findMany({
    where: { personId },
    include: {
      set: {
        include: {
          channel: {
            include: { label: true },
          },
          session: {
            include: { project: true },
          },
        },
      },
    },
    orderBy: { set: { releaseDate: "desc" } },
  });

  return contributions
    .filter((c) => !c.set.deletedAt)
    .map((c) => ({
      setId: c.set.id,
      setTitle: c.set.title,
      setType: c.set.type,
      role: c.role,
      releaseDate: c.set.releaseDate,
      releaseDatePrecision: c.set.releaseDatePrecision,
      channelName: c.set.channel?.name ?? null,
      labelId: c.set.channel?.label?.id ?? null,
      labelName: c.set.channel?.label?.name ?? null,
      projectName: c.set.session?.project?.name ?? null,
    }));
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

  const activeBodyMarks: BodyMarkWithEvents[] = [];
  const seenMarkIds = new Set<string>();
  for (const persona of person.personas) {
    for (const event of persona.bodyMarkEvents) {
      if (seenMarkIds.has(event.bodyMark.id)) continue;
      seenMarkIds.add(event.bodyMark.id);
      const mark = event.bodyMark;
      if (mark.status !== "present") continue;
      // Collect all events for this mark across all personas
      const allEvents = person.personas.flatMap((p) =>
        p.bodyMarkEvents
          .filter((e) => e.bodyMark.id === mark.id)
          .map((e) => ({
            id: e.id,
            eventType: e.eventType,
            notes: e.notes,
            persona: { id: p.id, label: p.label, date: p.date },
          })),
      );
      activeBodyMarks.push({
        id: mark.id,
        type: mark.type,
        bodyRegion: mark.bodyRegion,
        side: mark.side,
        position: mark.position,
        description: mark.description,
        motif: mark.motif,
        colors: mark.colors,
        size: mark.size,
        status: mark.status,
        events: allEvents,
      });
    }
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
  for (const persona of person.personas) {
    for (const s of persona.skills) {
      if (s.validTo && s.validTo <= now) continue;
      activeSkills.push({
        id: s.id,
        name: s.name,
        category: s.category,
        level: s.level,
        evidence: s.evidence,
        validFrom: s.validFrom,
        validTo: s.validTo,
        personaLabel: persona.label,
      });
    }
  }

  return {
    currentHairColor,
    weight,
    build,
    visionAids,
    fitnessLevel,
    activeBodyMarks,
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
  const contributions = await prisma.setContribution.findMany({
    where: { personId },
    include: {
      set: {
        include: {
          channel: { include: { label: true } },
        },
      },
    },
  });

  const labelMap = new Map<string, PersonAffiliation>();
  for (const c of contributions) {
    if (c.set.deletedAt) continue;
    const label = c.set.channel?.label;
    if (!label) continue;
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
          aliases: { where: { type: "common", deletedAt: null }, take: 1 },
        },
      },
      personB: {
        include: {
          aliases: { where: { type: "common", deletedAt: null }, take: 1 },
        },
      },
    },
    orderBy: { sharedSetCount: "desc" },
  });

  return relationships
    .filter((r) => {
      const other = r.personAId === personId ? r.personB : r.personA;
      return !other.deletedAt;
    })
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
        where: { personId: id, type: "common", deletedAt: null },
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
  const deletedAt = new Date();

  return prisma.$transaction(async (tx) => {
    // Soft-delete aliases
    await tx.personAlias.updateMany({
      where: { personId: id, deletedAt: null },
      data: { deletedAt },
    });

    // Fetch persona IDs for cascading
    const personas = await tx.persona.findMany({
      where: { personId: id, deletedAt: null },
      select: { id: true },
    });
    const personaIds = personas.map((p) => p.id);

    if (personaIds.length > 0) {
      // Hard-delete PersonaPhysical (no deletedAt column)
      await tx.personaPhysical.deleteMany({
        where: { personaId: { in: personaIds } },
      });

      // Soft-delete body mark events via personaId
      await tx.bodyMarkEvent.updateMany({
        where: { personaId: { in: personaIds }, deletedAt: null },
        data: { deletedAt },
      });

      // Soft-delete personas
      await tx.persona.updateMany({
        where: { id: { in: personaIds } },
        data: { deletedAt },
      });
    }

    // Soft-delete body marks
    await tx.bodyMark.updateMany({
      where: { personId: id, deletedAt: null },
      data: { deletedAt },
    });

    // Soft-delete body modifications + events
    await cascadeDeleteBodyModifications(tx, id, personaIds, deletedAt);

    // Soft-delete cosmetic procedures + events
    await cascadeDeleteCosmeticProcedures(tx, id, personaIds, deletedAt);

    // Soft-delete education, awards, interests
    await cascadeDeletePersonExtras(tx, id, deletedAt);

    // Soft-delete digital identities
    await tx.personDigitalIdentity.updateMany({
      where: { personId: id, deletedAt: null },
      data: { deletedAt },
    });

    // Soft-delete skills
    await tx.personSkill.updateMany({
      where: { personId: id, deletedAt: null },
      data: { deletedAt },
    });

    // Soft-delete set contributions
    await tx.setContribution.updateMany({
      where: { personId: id, deletedAt: null },
      data: { deletedAt },
    });

    // Soft-delete relationship events, then relationships
    await cascadeDeleteRelationshipEvents(tx, id, deletedAt);
    await tx.personRelationship.updateMany({
      where: {
        OR: [{ personAId: id }, { personBId: id }],
        deletedAt: null,
      },
      data: { deletedAt },
    });

    // Soft-delete photos
    await cascadeDeletePhotos(tx, "person", id, deletedAt);

    // Soft-delete the person
    return tx.person.update({
      where: { id },
      data: { deletedAt },
    });
  });
}

export type PaginatedPersons = {
  items: PersonWithCommonAlias[];
  nextCursor: string | null;
  totalCount: number;
};

export async function getPersonsPaginated(
  filters: PersonFilters = {},
  cursor?: string,
  limit = 50,
): Promise<PaginatedPersons> {
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
            deletedAt: null,
          },
        },
      },
    ];
  }

  const [totalCount, persons] = await Promise.all([
    prisma.person.count({ where }),
    prisma.person.findMany({
      where,
      include: {
        aliases: {
          where: { deletedAt: null, type: { in: ["common", "birth"] } },
        },
      },
      orderBy: { createdAt: "asc" },
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
