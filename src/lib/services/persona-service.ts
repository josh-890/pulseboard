import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type {
  Persona,
  ComputedTrait,
  RemovedTrait,
  CurrentPersonState,
  PersonaTimelineEntry,
  CreatePersonaInput,
  UpdatePersonaInput,
  SnapshotTrait,
  SnapshotRemovedTrait,
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

// Transaction client type — compatible with both prisma and tx inside $transaction
type TxClient = {
  persona: {
    findMany: typeof prisma.persona.findMany;
    update: typeof prisma.persona.update;
  };
  personaTrait: {
    updateMany: typeof prisma.personaTrait.updateMany;
  };
  $queryRaw: typeof prisma.$queryRaw;
};

async function renumberPersonas(
  personId: string,
  tx: TxClient,
  deletedInTx: Set<string> = new Set(),
): Promise<void> {
  // Fetch ALL personas including soft-deleted via raw SQL on the tx client
  // (bypasses soft-delete extension AND sees uncommitted tx changes)
  // to avoid unique constraint conflicts on @@unique([personId, sequenceNum])
  const allPersonas = await tx.$queryRaw<
    Array<{ id: string; deletedAt: Date | null }>
  >(
    Prisma.sql`
      SELECT id, "deletedAt"
      FROM "Persona"
      WHERE "personId" = ${personId}
      ORDER BY "effectiveDate" ASC, "createdAt" ASC
    `,
  );

  if (allPersonas.length === 0) return;

  // Phase 1: Move ALL personas (including deleted) to temp high numbers
  for (let i = 0; i < allPersonas.length; i++) {
    await tx.persona.update({
      where: { id: allPersonas[i].id },
      data: { sequenceNum: 100000 + i },
    });
  }

  // Phase 2: Set active personas to final sequential numbers,
  // deleted ones get numbers above the active count.
  // Include deletedInTx set for personas soft-deleted in the current
  // transaction (not yet visible to the raw query above).
  const active = allPersonas.filter(
    (p) => p.deletedAt === null && !deletedInTx.has(p.id),
  );
  const deleted = allPersonas.filter(
    (p) => p.deletedAt !== null || deletedInTx.has(p.id),
  );

  for (let i = 0; i < active.length; i++) {
    await tx.persona.update({
      where: { id: active[i].id },
      data: { sequenceNum: i },
    });
  }

  // Push deleted personas to high sequence numbers so they don't conflict
  for (let i = 0; i < deleted.length; i++) {
    await tx.persona.update({
      where: { id: deleted[i].id },
      data: { sequenceNum: 900000 + i },
    });
  }
}

export async function rebuildSnapshot(personId: string): Promise<void> {
  const state = await getCurrentPersonState(personId);

  if (!state || state.personaCount === 0) {
    // Delete snapshot if it exists
    await prisma.personSnapshot
      .delete({ where: { personId } })
      .catch(() => {
        // Ignore if not found
      });
    return;
  }

  const activeTraits: SnapshotTrait[] = state.traits.map((t) => ({
    traitCategoryId: t.traitCategoryId,
    categoryName: t.categoryName,
    name: t.name,
    metadata: t.metadata,
  }));

  const removedTraits: SnapshotRemovedTrait[] = state.removedTraits.map((t) => ({
    traitCategoryId: t.traitCategoryId,
    categoryName: t.categoryName,
    name: t.name,
    metadata: t.metadata,
    addedDate: t.addedDate.toISOString(),
    removedDate: t.removedDate.toISOString(),
  }));

  const snapshotData = {
    jobTitle: state.jobTitle,
    department: state.department,
    phone: state.phone,
    address: state.address,
    activeTraits: activeTraits as unknown as Prisma.InputJsonValue,
    removedTraits: removedTraits as unknown as Prisma.InputJsonValue,
    personaCount: state.personaCount,
    latestPersonaDate: state.latestPersonaDate,
  };

  await prisma.personSnapshot.upsert({
    where: { personId },
    create: { personId, ...snapshotData },
    update: snapshotData,
  });
}

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
  const removedTraits: RemovedTrait[] = [];

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
          addedDate: persona.effectiveDate,
        });
      } else {
        const existing = traitMap.get(key);
        if (existing) {
          removedTraits.push({
            traitCategoryId: existing.traitCategoryId,
            categoryName: existing.categoryName,
            name: existing.name,
            metadata: existing.metadata,
            addedDate: existing.addedDate,
            removedDate: persona.effectiveDate,
          });
          traitMap.delete(key);
        }
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
    removedTraits,
    personaCount: chain.length,
    latestPersonaDate: latestPersona?.effectiveDate ?? null,
  };
}

export async function getActiveTraitsAtSequence(
  personId: string,
  beforeSequenceNum: number,
): Promise<ComputedTrait[]> {
  const chain = await getPersonaChain(personId);
  const traitMap = new Map<string, ComputedTrait>();

  for (const persona of chain) {
    if (persona.sequenceNum >= beforeSequenceNum) break;

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
          addedDate: persona.effectiveDate,
        });
      } else {
        traitMap.delete(key);
      }
    }
  }

  return Array.from(traitMap.values());
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
        traitCategoryId: trait.traitCategoryId,
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

  // Create with temp sequenceNum, then renumber by date
  const persona = await prisma.$transaction(async (tx) => {
    const created = await tx.persona.create({
      data: {
        personId: data.personId,
        sequenceNum: 999999,
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

    await renumberPersonas(data.personId, tx as unknown as TxClient);

    return created;
  });

  await rebuildSnapshot(data.personId);

  return persona;
}

export async function getPersonaById(id: string): Promise<PersonaWithTraits | null> {
  return prisma.persona.findUnique({
    where: { id },
    include: {
      traits: {
        where: { deletedAt: null },
        include: { traitCategory: true },
      },
    },
  }) as Promise<PersonaWithTraits | null>;
}

export async function updatePersona(
  id: string,
  data: UpdatePersonaInput,
): Promise<Persona> {
  const persona = await prisma.$transaction(async (tx) => {
    const existing = await tx.persona.findUnique({ where: { id } });
    if (!existing) throw new Error(`Persona ${id} not found`);

    // Update scalar fields
    const updated = await tx.persona.update({
      where: { id },
      data: {
        effectiveDate: data.effectiveDate ?? undefined,
        note: data.note !== undefined ? data.note : undefined,
        jobTitle: data.jobTitle !== undefined ? data.jobTitle : undefined,
        department: data.department !== undefined ? data.department : undefined,
        phone: data.phone !== undefined ? data.phone : undefined,
        address: data.address !== undefined ? data.address : undefined,
      },
    });

    // Replace traits: soft-delete existing, create new
    if (data.traits !== undefined) {
      await tx.personaTrait.updateMany({
        where: { personaId: id, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      if (data.traits.length > 0) {
        await tx.personaTrait.createMany({
          data: data.traits.map((t) => ({
            personaId: id,
            traitCategoryId: t.traitCategoryId,
            name: t.name,
            action: t.action,
            metadata: (t.metadata as Prisma.InputJsonValue) ?? undefined,
          })),
        });
      }
    }

    // If effectiveDate changed, renumber the chain
    if (data.effectiveDate && data.effectiveDate.getTime() !== existing.effectiveDate.getTime()) {
      await renumberPersonas(existing.personId, tx as unknown as TxClient);
    }

    return updated;
  });

  // Get personId from the updated persona to rebuild snapshot
  const full = await prisma.persona.findUnique({ where: { id } });
  if (full) {
    await rebuildSnapshot(full.personId);
  }

  return persona;
}

export async function deletePersona(personaId: string): Promise<{ personId: string }> {
  const existing = await prisma.persona.findUnique({
    where: { id: personaId },
    select: { id: true, personId: true },
  });
  if (!existing) throw new Error(`Persona ${personaId} not found`);

  // Guard: cannot delete the only persona
  const count = await prisma.persona.count({
    where: { personId: existing.personId },
  });
  if (count <= 1) {
    throw new Error("Cannot delete the only persona");
  }

  await prisma.$transaction(async (tx) => {
    // Soft-delete the persona
    await tx.persona.update({
      where: { id: personaId },
      data: { deletedAt: new Date() },
    });

    // Soft-delete its traits
    await tx.personaTrait.updateMany({
      where: { personaId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    // Renumber remaining personas — pass deleted ID so raw query can exclude it
    await renumberPersonas(
      existing.personId,
      tx as unknown as TxClient,
      new Set([personaId]),
    );
  });

  await rebuildSnapshot(existing.personId);

  return { personId: existing.personId };
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
