import { prisma } from "@/lib/db";
import type { DatePrecision, Prisma } from "@/generated/prisma/client";
import type { CreatePersonaBatchInput, UpdatePersonaInput } from "@/lib/validations/persona";

type TxClient = Prisma.TransactionClient;

/**
 * Find an existing persona for the given date (same calendar month for DAY/MONTH,
 * same year for YEAR), or create a new one. Works inside a transaction for atomicity.
 */
export async function findOrCreatePersonaForDate(
  tx: TxClient,
  personId: string,
  date: Date | null,
  datePrecision: DatePrecision,
): Promise<string> {
  if (!date || datePrecision === "UNKNOWN") {
    const persona = await tx.persona.create({
      data: {
        personId,
        label: "Undated change",
        date: null,
        datePrecision: "UNKNOWN",
        isBaseline: false,
      },
    });
    return persona.id;
  }

  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed

  if (datePrecision === "YEAR") {
    // Match any persona in the same year
    const startOfYear = new Date(year, 0, 1);
    const startOfNextYear = new Date(year + 1, 0, 1);

    const existing = await tx.persona.findFirst({
      where: {
        personId,
        isBaseline: false,
        date: { gte: startOfYear, lt: startOfNextYear },
      },
      orderBy: { date: "asc" },
    });

    if (existing) return existing.id;

    const persona = await tx.persona.create({
      data: {
        personId,
        label: `${year}`,
        date: new Date(year, 0, 1),
        datePrecision: "YEAR",
        isBaseline: false,
      },
    });
    return persona.id;
  }

  // DAY or MONTH — match by same calendar month
  const startOfMonth = new Date(year, month, 1);
  const startOfNextMonth = new Date(year, month + 1, 1);

  const existing = await tx.persona.findFirst({
    where: {
      personId,
      isBaseline: false,
      date: { gte: startOfMonth, lt: startOfNextMonth },
    },
    orderBy: { date: "asc" },
  });

  if (existing) return existing.id;

  const monthName = date.toLocaleString("en-US", { month: "long" });
  const persona = await tx.persona.create({
    data: {
      personId,
      label: `${monthName} ${year}`,
      date,
      datePrecision,
      isBaseline: false,
    },
  });
  return persona.id;
}

/**
 * Get all personas for a person (for pickers in event dialogs).
 */
export async function getPersonPersonas(
  personId: string,
): Promise<{ id: string; label: string; date: Date | null }[]> {
  return prisma.persona.findMany({
    where: { personId },
    select: { id: true, label: true, date: true },
    orderBy: [{ isBaseline: "desc" }, { date: "asc" }],
  });
}

/**
 * Create a persona with all associated data in a single transaction.
 */
export async function createPersonaBatch(personId: string, data: CreatePersonaBatchInput) {
  return prisma.$transaction(async (tx) => {
    const persona = await tx.persona.create({
      data: {
        personId,
        label: data.label,
        date: data.date ? new Date(data.date) : null,
        datePrecision: data.datePrecision as DatePrecision,
        notes: data.notes ?? null,
        isBaseline: false,
      },
    });

    // Physical changes
    const hasPhysical = data.currentHairColor || data.weight || data.build || data.visionAids || data.fitnessLevel;
    if (hasPhysical) {
      await tx.personaPhysical.create({
        data: {
          personaId: persona.id,
          currentHairColor: data.currentHairColor ?? null,
          weight: data.weight ?? null,
          build: data.build ?? null,
          visionAids: data.visionAids ?? null,
          fitnessLevel: data.fitnessLevel ?? null,
        },
      });
    }

    // Events for existing body marks
    for (const event of data.bodyMarkEvents) {
      await tx.bodyMarkEvent.create({
        data: {
          bodyMarkId: event.bodyMarkId,
          personaId: persona.id,
          eventType: event.eventType,
          notes: event.notes ?? null,
        },
      });
    }

    // New body marks + "added" event
    for (const mark of data.newBodyMarks) {
      const created = await tx.bodyMark.create({
        data: {
          personId,
          type: mark.type,
          bodyRegion: mark.bodyRegion,
          side: mark.side ?? null,
          position: mark.position ?? null,
          description: mark.description ?? null,
          motif: mark.motif ?? null,
          colors: mark.colors,
          size: mark.size ?? null,
          status: mark.status,
        },
      });
      await tx.bodyMarkEvent.create({
        data: {
          bodyMarkId: created.id,
          personaId: persona.id,
          eventType: "added",
        },
      });
    }

    // Events for existing body modifications
    for (const event of data.bodyModificationEvents) {
      await tx.bodyModificationEvent.create({
        data: {
          bodyModificationId: event.bodyModificationId,
          personaId: persona.id,
          eventType: event.eventType,
          notes: event.notes ?? null,
        },
      });
    }

    // New body modifications + "added" event
    for (const mod of data.newBodyModifications) {
      const created = await tx.bodyModification.create({
        data: {
          personId,
          type: mod.type,
          bodyRegion: mod.bodyRegion,
          side: mod.side ?? null,
          position: mod.position ?? null,
          description: mod.description ?? null,
          material: mod.material ?? null,
          gauge: mod.gauge ?? null,
          status: mod.status,
        },
      });
      await tx.bodyModificationEvent.create({
        data: {
          bodyModificationId: created.id,
          personaId: persona.id,
          eventType: "added",
        },
      });
    }

    // Events for existing cosmetic procedures
    for (const event of data.cosmeticProcedureEvents) {
      await tx.cosmeticProcedureEvent.create({
        data: {
          cosmeticProcedureId: event.cosmeticProcedureId,
          personaId: persona.id,
          eventType: event.eventType,
          notes: event.notes ?? null,
        },
      });
    }

    // New cosmetic procedures + "performed" event
    for (const proc of data.newCosmeticProcedures) {
      const created = await tx.cosmeticProcedure.create({
        data: {
          personId,
          type: proc.type,
          bodyRegion: proc.bodyRegion,
          description: proc.description ?? null,
          provider: proc.provider ?? null,
          status: proc.status,
        },
      });
      await tx.cosmeticProcedureEvent.create({
        data: {
          cosmeticProcedureId: created.id,
          personaId: persona.id,
          eventType: "performed",
        },
      });
    }

    return persona;
  });
}

/**
 * Update persona metadata (label, date, notes).
 */
export async function updatePersona(id: string, data: UpdatePersonaInput) {
  return prisma.persona.update({
    where: { id },
    data: {
      ...(data.label !== undefined && { label: data.label }),
      ...(data.date !== undefined && { date: data.date ? new Date(data.date) : null }),
      ...(data.datePrecision !== undefined && { datePrecision: data.datePrecision as DatePrecision }),
      ...(data.notes !== undefined && { notes: data.notes || null }),
    },
  });
}

/**
 * Delete a persona and all linked events. Does NOT delete the entities themselves
 * (body marks, modifications, procedures) — only the events linked to this persona.
 * Prevents deleting baseline personas.
 */
export async function deletePersona(id: string) {
  return prisma.$transaction(async (tx) => {
    // Guard: prevent deleting baseline persona (inside tx to avoid TOCTOU)
    const persona = await tx.persona.findUniqueOrThrow({ where: { id } });
    if (persona.isBaseline) {
      throw new Error("Cannot delete baseline persona.");
    }

    // Delete linked events (not the entities)
    await tx.bodyMarkEvent.deleteMany({ where: { personaId: id } });
    await tx.bodyModificationEvent.deleteMany({ where: { personaId: id } });
    await tx.cosmeticProcedureEvent.deleteMany({ where: { personaId: id } });
    await tx.personSkillEvent.deleteMany({ where: { personaId: id } });
    // Delete PersonaPhysical
    await tx.personaPhysical.deleteMany({ where: { personaId: id } });
    // Delete digital identities linked to this persona
    await tx.personDigitalIdentity.deleteMany({ where: { personaId: id } });
    // Delete the persona
    return tx.persona.delete({ where: { id } });
  });
}
