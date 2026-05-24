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

  // Auto-created eras start as drafts — they exist purely to host the incoming
  // event/delta and haven't been curated by the user yet. Curating (editing
  // label/date/notes via updateEra) clears the flag.
  const era = await tx.era.create({
    data: {
      personId,
      label: `${year}`,
      date: new Date(Date.UTC(year, 0, 1)),
      datePrecision: "YEAR",
      isBaseline: false,
      isDraft: true,
    },
  });
  return era.id;
}

// ─── Phase G Slice 7 (ADR-0006): emergent Era authoring via proximity ───────

/**
 * Width of the proximity window for auto-clustering. Defined once here so the
 * tuning knob is a single-line change. Per ADR-0006 §"How to apply": start at
 * ±6 months; revisit empirically after ~2 weeks of use.
 */
export const AUTO_CLUSTER_WINDOW_MONTHS = 6;

/**
 * Phase G Slice 7 (ADR-0006): emergent-Era auto-clustering for the
 * record-physical-change flow.
 *
 * Replaces calendar-year bucketing (`findOrCreateEraForDate`) for the inline
 * "record a change" path. Sticky-membership is preserved for curated Eras —
 * this function only ever creates or returns DRAFT Eras.
 *
 * Routing:
 * - `date === null` → return (or create) the person's **dateless draft Era**
 *   (a draft Era with `date IS NULL`). Per ADR-0006 this is distinct from
 *   Baseline: Baseline = "this was always true"; dateless draft = "this is
 *   a real change, I just don't know when yet."
 * - `date` set → find a draft Era for this person whose ScalarDelta members
 *   have at least one date within ±AUTO_CLUSTER_WINDOW_MONTHS of `date`; if
 *   found, return it; else create a new draft Era seeded with `date`.
 */
export async function autoClusterDeltaIntoDraftEra(
  tx: TxClient,
  personId: string,
  date: Date | null,
  datePrecision: DatePrecision,
): Promise<string> {
  if (!date) {
    const existing = await tx.era.findFirst({
      where: { personId, isDraft: true, isBaseline: false, date: null },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (existing) return existing.id;
    const created = await tx.era.create({
      data: {
        personId,
        label: "Undated changes",
        date: null,
        datePrecision: "UNKNOWN",
        isBaseline: false,
        isDraft: true,
      },
      select: { id: true },
    });
    return created.id;
  }

  // Search window: [date - N months, date + N months]
  const windowStart = new Date(date);
  windowStart.setUTCMonth(windowStart.getUTCMonth() - AUTO_CLUSTER_WINDOW_MONTHS);
  const windowEnd = new Date(date);
  windowEnd.setUTCMonth(windowEnd.getUTCMonth() + AUTO_CLUSTER_WINDOW_MONTHS);

  const match = await tx.era.findFirst({
    where: {
      personId,
      isDraft: true,
      isBaseline: false,
      scalarDeltas: { some: { date: { gte: windowStart, lte: windowEnd } } },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (match) return match.id;

  const created = await tx.era.create({
    data: {
      personId,
      label: `${date.getUTCFullYear()}`,
      date,
      datePrecision,
      isBaseline: false,
      isDraft: true,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Phase G Slice 8 (ADR-0006): delete a draft Era if it has no remaining
 * members (deltas, events, contributions). Never deletes baseline or
 * curated Eras. Returns true if the Era was deleted.
 *
 * Intended for use after moving a delta out of a draft Era — if the source
 * was the last thing keeping that draft alive, the draft is empty noise
 * and should disappear.
 */
export async function deleteDraftEraIfEmpty(
  tx: TxClient,
  eraId: string,
): Promise<boolean> {
  const era = await tx.era.findUnique({
    where: { id: eraId },
    select: { id: true, isDraft: true, isBaseline: true },
  });
  if (!era || era.isBaseline || !era.isDraft) return false;

  const [
    deltas,
    bodyMarkEvents,
    bodyModEvents,
    digitalIdEvents,
    interestEvents,
    skillEvents,
    contributions,
    digitalIds,
  ] = await Promise.all([
    tx.scalarDelta.count({ where: { eraId } }),
    tx.bodyMarkEvent.count({ where: { eraId } }),
    tx.bodyModificationEvent.count({ where: { eraId } }),
    tx.digitalIdentityEvent.count({ where: { eraId } }),
    tx.interestEvent.count({ where: { eraId } }),
    tx.personSkillEvent.count({ where: { eraId } }),
    tx.sessionContribution.count({ where: { eraId } }),
    tx.personDigitalIdentity.count({ where: { eraId } }),
  ]);

  const totalMembers =
    deltas + bodyMarkEvents + bodyModEvents + digitalIdEvents +
    interestEvents + skillEvents + contributions + digitalIds;
  if (totalMembers > 0) return false;

  await tx.era.delete({ where: { id: eraId } });
  return true;
}

/**
 * Reverse navigation (ADR-0004): for each Era of a person, return the
 * contributions filed into it. Returns a Map keyed by eraId. Fetched
 * separately from `getPersonWithDetails` because nesting it under
 * `Era.contributions` blew Prisma's type-inference recursion budget.
 */
export type EraContributionRow = {
  id: string;
  eraId: string | null;
  roleDefinition: { name: string };
  session: {
    id: string;
    name: string;
    date: Date | null;
    datePrecision: string;
    type: string;
  };
};

export async function getPersonEraContributions(
  personId: string,
): Promise<Map<string, EraContributionRow[]>> {
  const rows = await prisma.sessionContribution.findMany({
    where: { personId, eraId: { not: null } },
    select: {
      id: true,
      eraId: true,
      roleDefinition: { select: { name: true } },
      session: {
        select: {
          id: true,
          name: true,
          date: true,
          datePrecision: true,
          type: true,
        },
      },
    },
    orderBy: { session: { date: "asc" } },
  });
  const byEra = new Map<string, EraContributionRow[]>();
  for (const row of rows) {
    if (!row.eraId) continue;
    const list = byEra.get(row.eraId) ?? [];
    list.push(row as EraContributionRow);
    byEra.set(row.eraId, list);
  }
  return byEra;
}

export type EraContributionInfo = EraContributionRow[];

/**
 * Get all eras for a person (for pickers in event dialogs).
 */
export async function getPersonEras(
  personId: string,
): Promise<{ id: string; label: string; date: Date | null; isBaseline: boolean }[]> {
  return prisma.era.findMany({
    where: { personId },
    select: { id: true, label: true, date: true, isBaseline: true },
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

    // Physical changes — one ScalarDelta per provided attribute.
    const physicalDeltas: { attributeDefinitionId: string; value: string }[] = [];
    if (data.currentHairColor)
      physicalDeltas.push({ attributeDefinitionId: "cattr-hair-color", value: data.currentHairColor });
    if (data.weight !== undefined && data.weight !== null)
      physicalDeltas.push({ attributeDefinitionId: "cattr-weight", value: String(data.weight) });
    if (data.build)
      physicalDeltas.push({ attributeDefinitionId: "cattr-build", value: data.build });
    if (physicalDeltas.length > 0) {
      await tx.scalarDelta.createMany({
        data: physicalDeltas.map((d) => ({
          eraId: era.id,
          attributeDefinitionId: d.attributeDefinitionId,
          value: d.value,
          date: eventDate,
          datePrecision: eventDatePrecision,
          dateModifier: eventDateModifier,
        })),
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
        // Any user-visible edit promotes a draft era to curated.
        isDraft: false,
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
    await tx.digitalIdentityEvent.deleteMany({ where: { eraId: id } });
    await tx.interestEvent.deleteMany({ where: { eraId: id } });
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
    // Delete this era's scalar deltas
    await tx.scalarDelta.deleteMany({ where: { eraId: id } });
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
