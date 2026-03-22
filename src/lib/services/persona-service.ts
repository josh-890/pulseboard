import { prisma } from "@/lib/db";
import type { DatePrecision, Prisma } from "@/generated/prisma/client";
import type { CreatePersonaBatchInput, UpdatePersonaInput } from "@/lib/validations/persona";

type TxClient = Prisma.TransactionClient;

/**
 * Get the baseline persona ID for a person. Throws if not found.
 */
export async function getBaselinePersonaId(tx: TxClient, personId: string): Promise<string> {
  const baseline = await tx.persona.findFirst({
    where: { personId, isBaseline: true },
    select: { id: true },
  });
  if (!baseline) throw new Error(`Baseline persona not found for person ${personId}`);
  return baseline.id;
}

/**
 * Find an existing persona for the given date (same calendar month for DAY/MONTH,
 * same year for YEAR), or create a new one. Works inside a transaction for atomicity.
 * Undated entities attach to the baseline persona.
 */
export async function findOrCreatePersonaForDate(
  tx: TxClient,
  personId: string,
  date: Date | null,
  datePrecision: DatePrecision,
): Promise<string> {
  if (!date || datePrecision === "UNKNOWN") {
    return getBaselinePersonaId(tx, personId);
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
    const hasPhysical = data.currentHairColor || data.weight || data.build;
    if (hasPhysical) {
      await tx.personaPhysical.create({
        data: {
          personaId: persona.id,
          currentHairColor: data.currentHairColor ?? null,
          weight: data.weight ?? null,
          build: data.build ?? null,
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
 * Delete a persona and all linked events. After deleting events, auto-deletes
 * any parent entities (BodyMark, BodyModification, CosmeticProcedure, PersonSkill)
 * that are left with zero remaining events. Prevents deleting baseline personas.
 */
export async function deletePersona(id: string) {
  return prisma.$transaction(async (tx) => {
    // Guard: prevent deleting baseline persona (inside tx to avoid TOCTOU)
    const persona = await tx.persona.findUniqueOrThrow({ where: { id } });
    if (persona.isBaseline) {
      throw new Error("Cannot delete baseline persona.");
    }

    const personId = persona.personId;

    // Delete linked events (skill event media first, then events)
    await tx.bodyMarkEvent.deleteMany({ where: { personaId: id } });
    await tx.bodyModificationEvent.deleteMany({ where: { personaId: id } });
    await tx.cosmeticProcedureEvent.deleteMany({ where: { personaId: id } });
    const skillEvents = await tx.personSkillEvent.findMany({
      where: { personaId: id },
      select: { id: true },
    });
    if (skillEvents.length > 0) {
      await tx.skillEventMedia.deleteMany({
        where: { skillEventId: { in: skillEvents.map((e) => e.id) } },
      });
    }
    await tx.personSkillEvent.deleteMany({ where: { personaId: id } });
    // Delete PersonaPhysical + PersonaPhysicalAttribute
    const personaPhysicals = await tx.personaPhysical.findMany({
      where: { personaId: id },
      select: { id: true },
    });
    if (personaPhysicals.length > 0) {
      await tx.personaPhysicalAttribute.deleteMany({
        where: { personaPhysicalId: { in: personaPhysicals.map((p) => p.id) } },
      });
    }
    await tx.personaPhysical.deleteMany({ where: { personaId: id } });
    // Delete digital identities linked to this persona
    await tx.personDigitalIdentity.deleteMany({ where: { personaId: id } });

    // Clean up orphaned parent entities (those with zero remaining events)
    await cleanupOrphanedEntities(tx, personId);

    // Delete the persona
    return tx.persona.delete({ where: { id } });
  });
}

/**
 * After deleting events for a persona, find and remove parent entities
 * (BodyMark, BodyModification, CosmeticProcedure, PersonSkill) that have
 * zero remaining events. Also cleans up PersonMediaLink references.
 */
async function cleanupOrphanedEntities(tx: TxClient, personId: string) {
  // --- BodyMarks with zero events ---
  const orphanedBodyMarks = await tx.bodyMark.findMany({
    where: { personId, events: { none: {} } },
    select: { id: true },
  });
  if (orphanedBodyMarks.length > 0) {
    const ids = orphanedBodyMarks.map((e) => e.id);
    await tx.personMediaLink.deleteMany({ where: { bodyMarkId: { in: ids } } });
    await tx.bodyMark.deleteMany({ where: { id: { in: ids } } });
  }

  // --- BodyModifications with zero events ---
  const orphanedBodyMods = await tx.bodyModification.findMany({
    where: { personId, events: { none: {} } },
    select: { id: true },
  });
  if (orphanedBodyMods.length > 0) {
    const ids = orphanedBodyMods.map((e) => e.id);
    await tx.personMediaLink.deleteMany({ where: { bodyModificationId: { in: ids } } });
    await tx.bodyModification.deleteMany({ where: { id: { in: ids } } });
  }

  // --- CosmeticProcedures with zero events ---
  const orphanedProcs = await tx.cosmeticProcedure.findMany({
    where: { personId, events: { none: {} } },
    select: { id: true },
  });
  if (orphanedProcs.length > 0) {
    const ids = orphanedProcs.map((e) => e.id);
    await tx.personMediaLink.deleteMany({ where: { cosmeticProcedureId: { in: ids } } });
    await tx.cosmeticProcedure.deleteMany({ where: { id: { in: ids } } });
  }

  // --- PersonSkills with zero events ---
  const orphanedSkills = await tx.personSkill.findMany({
    where: { personId, events: { none: {} } },
    select: { id: true },
  });
  if (orphanedSkills.length > 0) {
    const ids = orphanedSkills.map((e) => e.id);
    await tx.personSkill.deleteMany({ where: { id: { in: ids } } });
  }
}
