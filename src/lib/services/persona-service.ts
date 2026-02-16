import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type {
  Persona,
  ComputedTrait,
  CurrentPersonState,
  PersonaTimelineEntry,
  CreatePersonaInput,
} from "@/lib/types";

type PersonaWithTraits = Persona & {
  traits: Array<{
    id: string;
    traitCategoryId: string;
    traitCategory: { id: string; name: string };
    name: string;
    action: "add" | "remove";
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    deletedAt: Date | null;
  }>;
};

const SCALAR_FIELDS = ["jobTitle", "department", "phone", "address"] as const;

export async function getPersonaChain(
  personId: string,
): Promise<PersonaWithTraits[]> {
  return prisma.persona.findMany({
    where: { personId },
    orderBy: { sequenceNum: "asc" },
    include: {
      traits: {
        where: { deletedAt: null },
        include: { traitCategory: true },
      },
    },
  }) as Promise<PersonaWithTraits[]>;
}

export async function getCurrentPersonState(
  personId: string,
): Promise<CurrentPersonState | null> {
  const person = await prisma.person.findUnique({ where: { id: personId } });
  if (!person) return null;

  const chain = await getPersonaChain(personId);

  // Collapse scalars
  let jobTitle: string | null = null;
  let department: string | null = null;
  let phone: string | null = null;
  let address: string | null = null;

  // Collapse traits: Map<"categoryId:name", ComputedTrait>
  const traitMap = new Map<string, ComputedTrait>();

  for (const persona of chain) {
    if (persona.jobTitle !== null) jobTitle = persona.jobTitle;
    if (persona.department !== null) department = persona.department;
    if (persona.phone !== null) phone = persona.phone;
    if (persona.address !== null) address = persona.address;

    for (const trait of persona.traits) {
      const key = `${trait.traitCategoryId}:${trait.name}`;
      if (trait.action === "add") {
        traitMap.set(key, {
          traitCategoryId: trait.traitCategoryId,
          categoryName: trait.traitCategory.name,
          name: trait.name,
          metadata: trait.metadata as Record<string, unknown> | null,
          lastModifiedPersonaId: persona.id,
          lastModifiedDate: persona.effectiveDate,
        });
      } else {
        traitMap.delete(key);
      }
    }
  }

  const latestPersona = chain.length > 0 ? chain[chain.length - 1] : null;

  return {
    personId: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    avatarColor: person.avatarColor,
    birthdate: person.birthdate,
    jobTitle,
    department,
    phone,
    address,
    traits: Array.from(traitMap.values()),
    personaCount: chain.length,
    latestPersonaDate: latestPersona?.effectiveDate ?? null,
  };
}

export async function getPersonaTimeline(
  personId: string,
): Promise<PersonaTimelineEntry[]> {
  const chain = await getPersonaChain(personId);

  return chain.map((persona) => {
    const scalarChanges: PersonaTimelineEntry["scalarChanges"] = [];
    for (const field of SCALAR_FIELDS) {
      if (persona[field] !== null) {
        scalarChanges.push({ field, value: persona[field] });
      }
    }

    const traitChanges: PersonaTimelineEntry["traitChanges"] = persona.traits.map(
      (trait) => ({
        categoryName: trait.traitCategory.name,
        name: trait.name,
        action: trait.action,
        metadata: trait.metadata as Record<string, unknown> | null,
      }),
    );

    return {
      id: persona.id,
      sequenceNum: persona.sequenceNum,
      effectiveDate: persona.effectiveDate,
      note: persona.note,
      scalarChanges,
      traitChanges,
    };
  });
}

export async function createPersona(data: CreatePersonaInput): Promise<Persona> {
  const person = await prisma.person.findUnique({
    where: { id: data.personId },
  });
  if (!person) throw new Error(`Person ${data.personId} not found`);

  // Auto-assign next sequenceNum in a transaction
  return prisma.$transaction(async (tx) => {
    const lastPersona = await tx.persona.findFirst({
      where: { personId: data.personId },
      orderBy: { sequenceNum: "desc" },
    });
    const nextSeq = lastPersona ? lastPersona.sequenceNum + 1 : 0;

    const persona = await tx.persona.create({
      data: {
        personId: data.personId,
        sequenceNum: nextSeq,
        effectiveDate: data.effectiveDate,
        note: data.note,
        jobTitle: data.jobTitle,
        department: data.department,
        phone: data.phone,
        address: data.address,
        traits: data.traits
          ? {
              create: data.traits.map((t) => ({
                traitCategory: { connect: { id: t.traitCategoryId } },
                name: t.name,
                action: t.action,
                metadata: (t.metadata as Prisma.InputJsonValue) ?? undefined,
              })),
            }
          : undefined,
      },
      include: { traits: true },
    });

    return persona;
  });
}

export async function findPeopleByTrait(
  categoryId: string,
  name: string,
): Promise<Array<{ personId: string; trait: ComputedTrait }>> {
  // Get all people who have at least one persona with this trait
  const personas = await prisma.persona.findMany({
    where: {
      traits: {
        some: {
          traitCategoryId: categoryId,
          name,
          deletedAt: null,
        },
      },
    },
    select: { personId: true },
    distinct: ["personId"],
  });

  const results: Array<{ personId: string; trait: ComputedTrait }> = [];

  for (const { personId } of personas) {
    const state = await getCurrentPersonState(personId);
    if (!state) continue;
    const trait = state.traits.find(
      (t) => t.traitCategoryId === categoryId && t.name === name,
    );
    // Only include if trait survives collapse (wasn't removed later)
    if (trait) {
      results.push({ personId, trait });
    }
  }

  return results;
}

export async function findPeopleByTraitCategory(
  categoryId: string,
): Promise<Array<{ personId: string; traits: ComputedTrait[] }>> {
  const personas = await prisma.persona.findMany({
    where: {
      traits: {
        some: {
          traitCategoryId: categoryId,
          deletedAt: null,
        },
      },
    },
    select: { personId: true },
    distinct: ["personId"],
  });

  const results: Array<{ personId: string; traits: ComputedTrait[] }> = [];

  for (const { personId } of personas) {
    const state = await getCurrentPersonState(personId);
    if (!state) continue;
    const categoryTraits = state.traits.filter(
      (t) => t.traitCategoryId === categoryId,
    );
    if (categoryTraits.length > 0) {
      results.push({ personId, traits: categoryTraits });
    }
  }

  return results;
}
