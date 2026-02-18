import { prisma } from "@/lib/db";
import type {
  Person,
  PersonWithPrimaryAlias,
  PersonWorkHistoryItem,
  PersonAffiliation,
  PersonConnection,
} from "@/lib/types";
import type { PersonStatus, Prisma } from "@/generated/prisma/client";

export type PersonFilters = {
  q?: string;
  status?: PersonStatus | "all";
  hairColor?: string;
  bodyType?: string;
  ethnicity?: string;
};

export async function getPersons(filters: PersonFilters = {}): Promise<PersonWithPrimaryAlias[]> {
  const { q, status, hairColor, bodyType, ethnicity } = filters;

  const where: Prisma.PersonWhereInput = {};

  if (status && status !== "all") {
    where.status = status;
  }

  if (hairColor) {
    where.hairColor = { equals: hairColor, mode: "insensitive" };
  }

  if (bodyType) {
    where.bodyType = { equals: bodyType, mode: "insensitive" };
  }

  if (ethnicity) {
    where.ethnicity = { equals: ethnicity, mode: "insensitive" };
  }

  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
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
        where: { isPrimary: true, deletedAt: null },
        take: 1,
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return persons.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    status: p.status,
    rating: p.rating,
    tags: p.tags,
    hairColor: p.hairColor,
    bodyType: p.bodyType,
    ethnicity: p.ethnicity,
    location: p.location,
    activeSince: p.activeSince,
    specialization: p.specialization,
    createdAt: p.createdAt,
    primaryAlias: p.aliases[0]?.name ?? null,
  }));
}

export async function getPersonById(id: string): Promise<Person | null> {
  return prisma.person.findUnique({ where: { id } });
}

export async function getPersonWithDetails(id: string) {
  return prisma.person.findUnique({
    where: { id },
    include: {
      aliases: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
      personas: { orderBy: [{ isBaseline: "desc" }, { name: "asc" }] },
    },
  });
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

  return contributions.map((c) => ({
    setId: c.set.id,
    setTitle: c.set.title,
    setType: c.set.type,
    role: c.role,
    releaseDate: c.set.releaseDate,
    channelName: c.set.channel?.name ?? null,
    labelName: c.set.channel?.label.name ?? null,
    projectName: c.set.session.project.name,
  }));
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
          aliases: { where: { isPrimary: true, deletedAt: null }, take: 1 },
        },
      },
      personB: {
        include: {
          aliases: { where: { isPrimary: true, deletedAt: null }, take: 1 },
        },
      },
    },
    orderBy: { sharedSetCount: "desc" },
  });

  return relationships.map((r) => {
    const other = r.personAId === personId ? r.personB : r.personA;
    return {
      personId: other.id,
      firstName: other.firstName,
      lastName: other.lastName,
      primaryAlias: other.aliases[0]?.name ?? null,
      sharedSetCount: r.sharedSetCount,
      source: r.source,
      label: r.label,
    };
  });
}

export async function countPersons(): Promise<number> {
  return prisma.person.count();
}

export async function getDistinctHairColors(): Promise<string[]> {
  const result = await prisma.person.findMany({
    where: { hairColor: { not: null } },
    select: { hairColor: true },
    distinct: ["hairColor"],
    orderBy: { hairColor: "asc" },
  });
  return result.map((r) => r.hairColor!).filter(Boolean);
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
