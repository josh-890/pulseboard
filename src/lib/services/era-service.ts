import { prisma } from "@/lib/db";
import type { DateModifier, DatePrecision, Prisma } from "@/generated/prisma/client";
import type { CreateEraBatchInput, UpdateEraInput } from "@/lib/validations/era";
import { ensureCatalogEntry } from "@/lib/services/color-catalog-service";
import { recomputePersonCurrentState } from "@/lib/services/current-state-service";

type TxClient = Prisma.TransactionClient;

/**
 * Get the baseline era ID for a person. Throws if not found.
 */
export async function getBaselineEraId(tx: TxClient, personId: string): Promise<string> {
  const baseline = await tx.era.findFirst({
    where: { personId, isBaseline: true },
    select: { id: true },
  });
  if (!baseline) throw new Error(`Baseline era not found for person ${personId}`);
  return baseline.id;
}

/**
 * Find an existing era for the given date (same calendar month for DAY/MONTH,
 * same year for YEAR), or create a new one. Works inside a transaction for atomicity.
 * Undated entities attach to the baseline era.
 */
export async function findOrCreateEraForDate(
  tx: TxClient,
  personId: string,
  date: Date | null,
  datePrecision: DatePrecision,
): Promise<string> {
  if (!date || datePrecision === "UNKNOWN") {
    return getBaselineEraId(tx, personId);
  }

  const year = date.getUTCFullYear();

  // All non-UNKNOWN dates → YEAR bucket only.
  // The event's precise date lives on the event itself.
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const startOfNextYear = new Date(Date.UTC(year + 1, 0, 1));

  const existing = await tx.era.findFirst({
    where: {
      personId,
      isBaseline: false,
      date: { gte: startOfYear, lt: startOfNextYear },
    },
    orderBy: { date: "asc" },
  });

  if (existing) return existing.id;

  const era = await tx.era.create({
    data: {
      personId,
      label: `${year}`,
      date: new Date(Date.UTC(year, 0, 1)),
      datePrecision: "YEAR",
      isBaseline: false,
    },
  });
  return era.id;
}

/**
 * Get all eras for a person (for pickers in event dialogs).
 */
export async function getPersonEras(
  personId: string,
): Promise<{ id: string; label: string; date: Date | null }[]> {
  return prisma.era.findMany({
    where: { personId },
    select: { id: true, label: true, date: true },
    orderBy: [{ isBaseline: "desc" }, { date: "asc" }],
  });
}

/**
 * Create a era with all associated data in a single transaction.
 */
export async function createEraBatch(personId: string, data: CreateEraBatchInput) {
  await ensureCatalogEntry("hair", data.currentHairColor);
  return prisma.$transaction(async (tx) => {
    const era = await tx.era.create({
      data: {
        personId,
        label: data.label,
        date: data.date ? new Date(data.date) : null,
        datePrecision: data.datePrecision as DatePrecision,
        notes: data.notes ?? null,
        isBaseline: false,
      },
    });

    // Event date fields — inherit from era date
    const eventDate = data.date ? new Date(data.date) : null;
    const eventDatePrecision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;
    const eventDateModifier = "EXACT" as DateModifier;

    // Physical changes
    const hasPhysical = data.currentHairColor || data.weight || data.build;
    if (hasPhysical) {
      await tx.personaPhysical.create({
        data: {
          eraId: era.id,
          currentHairColor: data.currentHairColor ?? null,
          weight: data.weight ?? null,
          build: data.build ?? null,
          date: eventDate,
          datePrecision: eventDatePrecision,
          dateModifier: eventDateModifier,
        },
      });
    }

    // Events for existing body marks
    for (const event of data.bodyMarkEvents) {
      await tx.bodyMarkEvent.create({
        data: {
          bodyMarkId: event.bodyMarkId,
          eraId: era.id,
          eventType: event.eventType,
          notes: event.notes ?? null,
          date: eventDate,
          datePrecision: eventDatePrecision,
          dateModifier: eventDateModifier,
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
          eraId: era.id,
          eventType: "added",
          date: eventDate,
          datePrecision: eventDatePrecision,
          dateModifier: eventDateModifier,
        },
      });
    }

    // Events for existing body modifications
    for (const event of data.bodyModificationEvents) {
      await tx.bodyModificationEvent.create({
        data: {
          bodyModificationId: event.bodyModificationId,
          eraId: era.id,
          eventType: event.eventType,
          notes: event.notes ?? null,
          date: eventDate,
          datePrecision: eventDatePrecision,
          dateModifier: eventDateModifier,
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
          eraId: era.id,
          eventType: "added",
          date: eventDate,
          datePrecision: eventDatePrecision,
          dateModifier: eventDateModifier,
        },
      });
    }

    // Events for existing cosmetic procedures
    for (const event of data.cosmeticProcedureEvents) {
      await tx.cosmeticProcedureEvent.create({
        data: {
          cosmeticProcedureId: event.cosmeticProcedureId,
          eraId: era.id,
          eventType: event.eventType,
          notes: event.notes ?? null,
          date: eventDate,
          datePrecision: eventDatePrecision,
          dateModifier: eventDateModifier,
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
          eraId: era.id,
          eventType: "performed",
          date: eventDate,
          datePrecision: eventDatePrecision,
          dateModifier: eventDateModifier,
        },
      });
    }

    await recomputePersonCurrentState(tx, personId);
    return era;
  });
}

/**
 * Update era metadata (label, date, notes). A date change can re-order the fold,
 * so the person's current-state cache is recomputed in the same transaction.
 */
export async function updateEra(id: string, data: UpdateEraInput) {
  return prisma.$transaction(async (tx) => {
    const era = await tx.era.update({
      where: { id },
      data: {
        ...(data.label !== undefined && { label: data.label }),
        ...(data.date !== undefined && { date: data.date ? new Date(data.date) : null }),
        ...(data.datePrecision !== undefined && { datePrecision: data.datePrecision as DatePrecision }),
        ...(data.notes !== undefined && { notes: data.notes || null }),
      },
    });
    await recomputePersonCurrentState(tx, era.personId);
    return era;
  });
}

/**
 * Delete a era and all linked events. After deleting events, auto-deletes
 * any parent entities (BodyMark, BodyModification, CosmeticProcedure, PersonSkill)
 * that are left with zero remaining events. Prevents deleting baseline eras.
 */
export async function deleteEra(id: string) {
  return prisma.$transaction(async (tx) => {
    // Guard: prevent deleting baseline era (inside tx to avoid TOCTOU)
    const era = await tx.era.findUniqueOrThrow({ where: { id } });
    if (era.isBaseline) {
      throw new Error("Cannot delete baseline era.");
    }

    const personId = era.personId;

    // Delete linked events (skill event media first, then events)
    await tx.bodyMarkEvent.deleteMany({ where: { eraId: id } });
    await tx.bodyModificationEvent.deleteMany({ where: { eraId: id } });
    await tx.cosmeticProcedureEvent.deleteMany({ where: { eraId: id } });
    const skillEvents = await tx.personSkillEvent.findMany({
      where: { eraId: id },
      select: { id: true },
    });
    if (skillEvents.length > 0) {
      await tx.skillEventMedia.deleteMany({
        where: { skillEventId: { in: skillEvents.map((e) => e.id) } },
      });
    }
    await tx.personSkillEvent.deleteMany({ where: { eraId: id } });
    // Delete PersonaPhysical + PersonaPhysicalAttribute
    const personaPhysicals = await tx.personaPhysical.findMany({
      where: { eraId: id },
      select: { id: true },
    });
    if (personaPhysicals.length > 0) {
      await tx.personaPhysicalAttribute.deleteMany({
        where: { personaPhysicalId: { in: personaPhysicals.map((p) => p.id) } },
      });
    }
    await tx.personaPhysical.deleteMany({ where: { eraId: id } });
    // Delete digital identities linked to this era
    await tx.personDigitalIdentity.deleteMany({ where: { eraId: id } });

    // Clean up orphaned parent entities (those with zero remaining events)
    await cleanupOrphanedEntities(tx, personId);

    // Delete the era
    const deleted = await tx.era.delete({ where: { id } });
    await recomputePersonCurrentState(tx, personId);
    return deleted;
  });
}

/**
 * After deleting events for a era, find and remove parent entities
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
