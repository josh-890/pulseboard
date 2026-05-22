"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { ensureCatalogEntry } from "@/lib/services/color-catalog-service";
import type {
  Prisma,
  DatePrecision,
  BodyMarkType,
  BodyMarkStatus,
  BodyMarkEventType,
  BodyModificationType,
  BodyModificationStatus,
  BodyModificationEventType,
  CosmeticProcedureEventType,
} from "@/generated/prisma/client";
import {
  findOrCreateEraForDate,
  createEraBatch,
  updateEra,
  deleteEra,
} from "@/lib/services/era-service";
import type { CreateEraBatchInput } from "@/lib/validations/era";
import {
  deleteBodyMarkRecord,
  deleteBodyMarkEventRecord,
} from "@/lib/services/person-service";
import {
  deleteBodyModificationRecord,
  deleteBodyModificationEventRecord,
} from "@/lib/services/body-modification-service";
import {
  deleteCosmeticProcedureRecord,
  deleteCosmeticProcedureEventRecord,
} from "@/lib/services/cosmetic-procedure-service";
import {
  recomputePersonCurrentState,
  recomputePersonCurrentStateStandalone,
} from "@/lib/services/current-state-service";
import type { SimpleActionResult } from "@/lib/types";

type ActionResultWithId = SimpleActionResult & { id?: string };

// ─── Status Derivation ──────────────────────────────────────────────────────

const BODY_MARK_STATUS_MAP: Record<string, BodyMarkStatus> = {
  added: "present",
  modified: "modified",
  removed: "removed",
};

const BODY_MODIFICATION_STATUS_MAP: Record<string, BodyModificationStatus> = {
  added: "present",
  modified: "modified",
  removed: "removed",
};

const COSMETIC_PROCEDURE_STATUS_MAP: Record<string, string> = {
  performed: "completed",
  revised: "revised",
  reversed: "reversed",
};

function deriveBodyMarkStatus(events: { eventType: string }[]): BodyMarkStatus {
  if (events.length === 0) return "present";
  const last = events[events.length - 1];
  return BODY_MARK_STATUS_MAP[last.eventType] ?? "present";
}

function deriveBodyModificationStatus(events: { eventType: string }[]): BodyModificationStatus {
  if (events.length === 0) return "present";
  const last = events[events.length - 1];
  return BODY_MODIFICATION_STATUS_MAP[last.eventType] ?? "present";
}

function deriveCosmeticProcedureStatus(events: { eventType: string }[]): string {
  if (events.length === 0) return "completed";
  const last = events[events.length - 1];
  return COSMETIC_PROCEDURE_STATUS_MAP[last.eventType] ?? "completed";
}

// ─── Body Mark Actions ───────────────────────────────────────────────────────

export async function createBodyMarkAction(
  personId: string,
  data: {
    type: string;
    bodyRegion: string;
    bodyRegions?: string[];
    side?: string;
    position?: string;
    description?: string;
    motif?: string;
    colors?: string[];
    size?: string;
    date?: string | null;
    datePrecision?: string;
  },
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      const date = data.date ? new Date(data.date) : null;
      const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;

      let markId = "";
      await prisma.$transaction(async (tx) => {
        const eraId = await findOrCreateEraForDate(tx, personId, date, precision);
        const mark = await tx.bodyMark.create({
          data: {
            personId,
            type: data.type as BodyMarkType,
            bodyRegion: data.bodyRegion,
            bodyRegions: data.bodyRegions ?? [],
            side: data.side,
            position: data.position,
            description: data.description,
            motif: data.motif,
            colors: data.colors ?? [],
            size: data.size,
            status: "present" as BodyMarkStatus,
          },
        });
        markId = mark.id;
        await tx.bodyMarkEvent.create({
          data: {
            bodyMarkId: mark.id,
            eraId,
            eventType: "added",
            date,
            datePrecision: precision,
          },
        });
        await recomputePersonCurrentState(tx, personId);
      });

      revalidatePath(`/people/${personId}`);
      return { success: true, id: markId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function updateBodyMarkAction(
  id: string,
  personId: string,
  data: {
    type?: string;
    bodyRegion?: string;
    bodyRegions?: string[];
    side?: string;
    position?: string;
    description?: string;
    motif?: string;
    colors?: string[];
    size?: string;
    // Single-event convenience: date change moves the lone event
    singleEventDate?: string | null;
    singleEventDatePrecision?: string;
  },
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        // Update entity fields (no status — derived from events)
        await tx.bodyMark.update({
          where: { id },
          data: {
            type: data.type as BodyMarkType | undefined,
            bodyRegion: data.bodyRegion,
            bodyRegions: data.bodyRegions,
            side: data.side,
            position: data.position,
            description: data.description,
            motif: data.motif,
            colors: data.colors,
            size: data.size,
          },
        });

        // Single-event date convenience
        if (data.singleEventDate !== undefined) {
          const events = await tx.bodyMarkEvent.findMany({
            where: { bodyMarkId: id },
            orderBy: { date: "asc" },
          });
          if (events.length === 1) {
            const parsedDate = data.singleEventDate ? new Date(data.singleEventDate) : null;
            const precision = (data.singleEventDatePrecision ?? "UNKNOWN") as DatePrecision;
            const targetEraId = await findOrCreateEraForDate(tx, personId, parsedDate, precision);
            await tx.bodyMarkEvent.update({
              where: { id: events[0].id },
              data: {
                eraId: targetEraId,
                date: parsedDate,
                datePrecision: precision,
              },
            });
          }
        }
        await recomputePersonCurrentState(tx, personId);
      });

      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function deleteBodyMarkAction(
  id: string,
  personId: string,
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteBodyMarkRecord(id);
      await recomputePersonCurrentStateStandalone(personId);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function createBodyMarkEventAction(
  personId: string,
  data: {
    bodyMarkId: string;
    eventType: string;
    date?: string | null;
    datePrecision?: string;
    notes?: string;
    bodyRegions?: string[];
    motif?: string | null;
    colors?: string[];
    size?: string | null;
    description?: string | null;
  },
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        const parsedDate = data.date ? new Date(data.date) : null;
        const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;
        const eraId = await findOrCreateEraForDate(tx, personId, parsedDate, precision);

        await tx.bodyMarkEvent.create({
          data: {
            bodyMarkId: data.bodyMarkId,
            eraId,
            eventType: data.eventType as BodyMarkEventType,
            notes: data.notes,
            date: parsedDate,
            datePrecision: precision,
            bodyRegions: data.bodyRegions ?? [],
            motif: data.motif,
            colors: data.colors ?? [],
            size: data.size,
            description: data.description,
          },
        });

        // Auto-update entity status from all events
        const allEvents = await tx.bodyMarkEvent.findMany({
          where: { bodyMarkId: data.bodyMarkId },
          orderBy: { date: "asc" },
          select: { eventType: true },
        });
        await tx.bodyMark.update({
          where: { id: data.bodyMarkId },
          data: { status: deriveBodyMarkStatus(allEvents) },
        });
        await recomputePersonCurrentState(tx, personId);
      });

      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function updateBodyMarkEventAction(
  eventId: string,
  personId: string,
  data: {
    bodyMarkId: string;
    eventType: string;
    date?: string | null;
    datePrecision?: string;
    notes?: string;
    bodyRegions?: string[];
    motif?: string | null;
    colors?: string[];
    size?: string | null;
    description?: string | null;
  },
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        const parsedDate = data.date ? new Date(data.date) : null;
        const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;
        const targetEraId = await findOrCreateEraForDate(tx, personId, parsedDate, precision);

        await tx.bodyMarkEvent.update({
          where: { id: eventId },
          data: {
            eraId: targetEraId,
            eventType: data.eventType as BodyMarkEventType,
            notes: data.notes ?? null,
            date: parsedDate,
            datePrecision: precision,
            ...(data.bodyRegions !== undefined && { bodyRegions: data.bodyRegions }),
            ...(data.motif !== undefined && { motif: data.motif }),
            ...(data.colors !== undefined && { colors: data.colors }),
            ...(data.size !== undefined && { size: data.size }),
            ...(data.description !== undefined && { description: data.description }),
          },
        });

        // Auto-update entity status from all events
        const allEvents = await tx.bodyMarkEvent.findMany({
          where: { bodyMarkId: data.bodyMarkId },
          orderBy: { date: "asc" },
          select: { eventType: true },
        });
        await tx.bodyMark.update({
          where: { id: data.bodyMarkId },
          data: { status: deriveBodyMarkStatus(allEvents) },
        });
        await recomputePersonCurrentState(tx, personId);
      });

      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function deleteBodyMarkEventAction(
  id: string,
  personId: string,
  bodyMarkId?: string,
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      // Look up bodyMarkId if not provided (for backwards compatibility)
      const resolvedBodyMarkId = bodyMarkId ?? (await prisma.bodyMarkEvent.findUniqueOrThrow({ where: { id }, select: { bodyMarkId: true } })).bodyMarkId;

      await deleteBodyMarkEventRecord(id);

      // Auto-update entity status from remaining events
      const remainingEvents = await prisma.bodyMarkEvent.findMany({
        where: { bodyMarkId: resolvedBodyMarkId },
        orderBy: { date: "asc" },
        select: { eventType: true },
      });
      await prisma.bodyMark.update({
        where: { id: resolvedBodyMarkId },
        data: { status: deriveBodyMarkStatus(remainingEvents) },
      });
      await recomputePersonCurrentStateStandalone(personId);

      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

// ─── Body Modification Actions ───────────────────────────────────────────────

export async function createBodyModificationAction(
  personId: string,
  data: {
    type: string;
    bodyRegion: string;
    bodyRegions?: string[];
    side?: string;
    position?: string;
    description?: string;
    material?: string;
    gauge?: string;
    date?: string | null;
    datePrecision?: string;
  },
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      const date = data.date ? new Date(data.date) : null;
      const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;

      let modId = "";
      await prisma.$transaction(async (tx) => {
        const eraId = await findOrCreateEraForDate(tx, personId, date, precision);
        const mod = await tx.bodyModification.create({
          data: {
            personId,
            type: data.type as BodyModificationType,
            bodyRegion: data.bodyRegion,
            bodyRegions: data.bodyRegions ?? [],
            side: data.side,
            position: data.position,
            description: data.description,
            material: data.material,
            gauge: data.gauge,
            status: "present" as BodyModificationStatus,
          },
        });
        modId = mod.id;
        await tx.bodyModificationEvent.create({
          data: {
            bodyModificationId: mod.id,
            eraId,
            eventType: "added",
            date,
            datePrecision: precision,
          },
        });
        await recomputePersonCurrentState(tx, personId);
      });

      revalidatePath(`/people/${personId}`);
      return { success: true, id: modId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function updateBodyModificationAction(
  id: string,
  personId: string,
  data: {
    type?: string;
    bodyRegion?: string;
    bodyRegions?: string[];
    side?: string;
    position?: string;
    description?: string;
    material?: string;
    gauge?: string;
    singleEventDate?: string | null;
    singleEventDatePrecision?: string;
  },
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.bodyModification.update({
          where: { id },
          data: {
            type: data.type as BodyModificationType | undefined,
            bodyRegion: data.bodyRegion,
            bodyRegions: data.bodyRegions,
            side: data.side,
            position: data.position,
            description: data.description,
            material: data.material,
            gauge: data.gauge,
          },
        });

        // Single-event date convenience
        if (data.singleEventDate !== undefined) {
          const events = await tx.bodyModificationEvent.findMany({
            where: { bodyModificationId: id },
            orderBy: { date: "asc" },
          });
          if (events.length === 1) {
            const parsedDate = data.singleEventDate ? new Date(data.singleEventDate) : null;
            const precision = (data.singleEventDatePrecision ?? "UNKNOWN") as DatePrecision;
            const targetEraId = await findOrCreateEraForDate(tx, personId, parsedDate, precision);
            await tx.bodyModificationEvent.update({
              where: { id: events[0].id },
              data: {
                eraId: targetEraId,
                date: parsedDate,
                datePrecision: precision,
              },
            });
          }
        }
        await recomputePersonCurrentState(tx, personId);
      });

      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function deleteBodyModificationAction(
  id: string,
  personId: string,
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteBodyModificationRecord(id);
      await recomputePersonCurrentStateStandalone(personId);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function createBodyModificationEventAction(
  personId: string,
  data: {
    bodyModificationId: string;
    eventType: string;
    date?: string | null;
    datePrecision?: string;
    notes?: string;
    bodyRegions?: string[];
    description?: string | null;
    material?: string | null;
    gauge?: string | null;
  },
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        const parsedDate = data.date ? new Date(data.date) : null;
        const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;
        const eraId = await findOrCreateEraForDate(tx, personId, parsedDate, precision);

        await tx.bodyModificationEvent.create({
          data: {
            bodyModificationId: data.bodyModificationId,
            eraId,
            eventType: data.eventType as BodyModificationEventType,
            notes: data.notes,
            date: parsedDate,
            datePrecision: precision,
            bodyRegions: data.bodyRegions ?? [],
            description: data.description,
            material: data.material,
            gauge: data.gauge,
          },
        });

        const allEvents = await tx.bodyModificationEvent.findMany({
          where: { bodyModificationId: data.bodyModificationId },
          orderBy: { date: "asc" },
          select: { eventType: true },
        });
        await tx.bodyModification.update({
          where: { id: data.bodyModificationId },
          data: { status: deriveBodyModificationStatus(allEvents) },
        });
        await recomputePersonCurrentState(tx, personId);
      });

      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function updateBodyModificationEventAction(
  eventId: string,
  personId: string,
  data: {
    bodyModificationId: string;
    eventType: string;
    date?: string | null;
    datePrecision?: string;
    notes?: string;
    bodyRegions?: string[];
    description?: string | null;
    material?: string | null;
    gauge?: string | null;
  },
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        const parsedDate = data.date ? new Date(data.date) : null;
        const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;
        const targetEraId = await findOrCreateEraForDate(tx, personId, parsedDate, precision);

        await tx.bodyModificationEvent.update({
          where: { id: eventId },
          data: {
            eraId: targetEraId,
            eventType: data.eventType as BodyModificationEventType,
            notes: data.notes ?? null,
            date: parsedDate,
            datePrecision: precision,
            ...(data.bodyRegions !== undefined && { bodyRegions: data.bodyRegions }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.material !== undefined && { material: data.material }),
            ...(data.gauge !== undefined && { gauge: data.gauge }),
          },
        });

        const allEvents = await tx.bodyModificationEvent.findMany({
          where: { bodyModificationId: data.bodyModificationId },
          orderBy: { date: "asc" },
          select: { eventType: true },
        });
        await tx.bodyModification.update({
          where: { id: data.bodyModificationId },
          data: { status: deriveBodyModificationStatus(allEvents) },
        });
        await recomputePersonCurrentState(tx, personId);
      });

      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function deleteBodyModificationEventAction(
  id: string,
  personId: string,
  bodyModificationId?: string,
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      const resolvedId = bodyModificationId ?? (await prisma.bodyModificationEvent.findUniqueOrThrow({ where: { id }, select: { bodyModificationId: true } })).bodyModificationId;

      await deleteBodyModificationEventRecord(id);

      const remainingEvents = await prisma.bodyModificationEvent.findMany({
        where: { bodyModificationId: resolvedId },
        orderBy: { date: "asc" },
        select: { eventType: true },
      });
      await prisma.bodyModification.update({
        where: { id: resolvedId },
        data: { status: deriveBodyModificationStatus(remainingEvents) },
      });
      await recomputePersonCurrentStateStandalone(personId);

      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

// ─── Cosmetic Procedure Actions ──────────────────────────────────────────────

export async function createCosmeticProcedureAction(
  personId: string,
  data: {
    type: string;
    bodyRegion: string;
    bodyRegions?: string[];
    description?: string;
    provider?: string;
    date?: string | null;
    datePrecision?: string;
    attributeDefinitionId?: string;
  },
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      const date = data.date ? new Date(data.date) : null;
      const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;

      let procId = "";
      await prisma.$transaction(async (tx) => {
        const eraId = await findOrCreateEraForDate(tx, personId, date, precision);
        const proc = await tx.cosmeticProcedure.create({
          data: {
            personId,
            type: data.type,
            bodyRegion: data.bodyRegion,
            bodyRegions: data.bodyRegions ?? [],
            description: data.description,
            provider: data.provider,
            status: "completed",
            attributeDefinitionId: data.attributeDefinitionId ?? null,
          },
        });
        procId = proc.id;
        await tx.cosmeticProcedureEvent.create({
          data: {
            cosmeticProcedureId: proc.id,
            eraId,
            eventType: "performed",
            date,
            datePrecision: precision,
          },
        });
        await recomputePersonCurrentState(tx, personId);
      });

      revalidatePath(`/people/${personId}`);
      return { success: true, id: procId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function updateCosmeticProcedureAction(
  id: string,
  personId: string,
  data: {
    type?: string;
    bodyRegion?: string;
    bodyRegions?: string[];
    description?: string;
    provider?: string;
    singleEventDate?: string | null;
    singleEventDatePrecision?: string;
    attributeDefinitionId?: string | null;
  },
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.cosmeticProcedure.update({
          where: { id },
          data: {
            type: data.type,
            bodyRegion: data.bodyRegion,
            bodyRegions: data.bodyRegions,
            description: data.description,
            provider: data.provider,
            ...(data.attributeDefinitionId !== undefined ? { attributeDefinitionId: data.attributeDefinitionId } : {}),
          },
        });

        // Single-event date convenience
        if (data.singleEventDate !== undefined) {
          const events = await tx.cosmeticProcedureEvent.findMany({
            where: { cosmeticProcedureId: id },
            orderBy: { date: "asc" },
          });
          if (events.length === 1) {
            const parsedDate = data.singleEventDate ? new Date(data.singleEventDate) : null;
            const precision = (data.singleEventDatePrecision ?? "UNKNOWN") as DatePrecision;
            const targetEraId = await findOrCreateEraForDate(tx, personId, parsedDate, precision);
            await tx.cosmeticProcedureEvent.update({
              where: { id: events[0].id },
              data: {
                eraId: targetEraId,
                date: parsedDate,
                datePrecision: precision,
              },
            });
          }
        }
        await recomputePersonCurrentState(tx, personId);
      });

      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function deleteCosmeticProcedureAction(
  id: string,
  personId: string,
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteCosmeticProcedureRecord(id);
      await recomputePersonCurrentStateStandalone(personId);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function createCosmeticProcedureEventAction(
  personId: string,
  data: {
    cosmeticProcedureId: string;
    eventType: string;
    date?: string | null;
    datePrecision?: string;
    notes?: string;
    bodyRegions?: string[];
    description?: string | null;
    provider?: string | null;
    valueBefore?: string | null;
    valueAfter?: string | null;
    unit?: string | null;
  },
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        const parsedDate = data.date ? new Date(data.date) : null;
        const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;
        const eraId = await findOrCreateEraForDate(tx, personId, parsedDate, precision);

        await tx.cosmeticProcedureEvent.create({
          data: {
            cosmeticProcedureId: data.cosmeticProcedureId,
            eraId,
            eventType: data.eventType as CosmeticProcedureEventType,
            notes: data.notes,
            date: parsedDate,
            datePrecision: precision,
            bodyRegions: data.bodyRegions ?? [],
            description: data.description,
            provider: data.provider,
            valueBefore: data.valueBefore ?? null,
            valueAfter: data.valueAfter ?? null,
            unit: data.unit ?? null,
          },
        });

        const allEvents = await tx.cosmeticProcedureEvent.findMany({
          where: { cosmeticProcedureId: data.cosmeticProcedureId },
          orderBy: { date: "asc" },
          select: { eventType: true },
        });
        await tx.cosmeticProcedure.update({
          where: { id: data.cosmeticProcedureId },
          data: { status: deriveCosmeticProcedureStatus(allEvents) },
        });
        await recomputePersonCurrentState(tx, personId);
      });

      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function updateCosmeticProcedureEventAction(
  eventId: string,
  personId: string,
  data: {
    cosmeticProcedureId: string;
    eventType: string;
    date?: string | null;
    datePrecision?: string;
    notes?: string;
    bodyRegions?: string[];
    description?: string | null;
    provider?: string | null;
    valueBefore?: string | null;
    valueAfter?: string | null;
    unit?: string | null;
  },
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        const parsedDate = data.date ? new Date(data.date) : null;
        const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;
        const targetEraId = await findOrCreateEraForDate(tx, personId, parsedDate, precision);

        await tx.cosmeticProcedureEvent.update({
          where: { id: eventId },
          data: {
            eraId: targetEraId,
            eventType: data.eventType as CosmeticProcedureEventType,
            notes: data.notes ?? null,
            date: parsedDate,
            datePrecision: precision,
            ...(data.bodyRegions !== undefined && { bodyRegions: data.bodyRegions }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.provider !== undefined && { provider: data.provider }),
            ...(data.valueBefore !== undefined && { valueBefore: data.valueBefore }),
            ...(data.valueAfter !== undefined && { valueAfter: data.valueAfter }),
            ...(data.unit !== undefined && { unit: data.unit }),
          },
        });

        const allEvents = await tx.cosmeticProcedureEvent.findMany({
          where: { cosmeticProcedureId: data.cosmeticProcedureId },
          orderBy: { date: "asc" },
          select: { eventType: true },
        });
        await tx.cosmeticProcedure.update({
          where: { id: data.cosmeticProcedureId },
          data: { status: deriveCosmeticProcedureStatus(allEvents) },
        });
        await recomputePersonCurrentState(tx, personId);
      });

      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function deleteCosmeticProcedureEventAction(
  id: string,
  personId: string,
  cosmeticProcedureId?: string,
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      const resolvedId = cosmeticProcedureId ?? (await prisma.cosmeticProcedureEvent.findUniqueOrThrow({ where: { id }, select: { cosmeticProcedureId: true } })).cosmeticProcedureId;

      await deleteCosmeticProcedureEventRecord(id);

      const remainingEvents = await prisma.cosmeticProcedureEvent.findMany({
        where: { cosmeticProcedureId: resolvedId },
        orderBy: { date: "asc" },
        select: { eventType: true },
      });
      await prisma.cosmeticProcedure.update({
        where: { id: resolvedId },
        data: { status: deriveCosmeticProcedureStatus(remainingEvents) },
      });
      await recomputePersonCurrentStateStandalone(personId);

      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

// ─── Physical Change Action ─────────────────────────────────────────────────

type PhysicalChangeData = {
  date?: string | null;
  datePrecision?: string;
  currentHairColor?: string;
  weight?: number;
  build?: string;
  breastSize?: string;
  breastStatus?: string; // accepted for compatibility — status is derived, not stored
  breastDescription?: string;
  attributes?: { definitionId: string; value: string }[];
};

type ScalarDeltaItem = { attributeDefinitionId: string; value: string; notes?: string | null };

// Map a physical-change form payload to ScalarDelta items.
function buildPhysicalDeltaItems(data: PhysicalChangeData): ScalarDeltaItem[] {
  const items: ScalarDeltaItem[] = [];
  if (data.currentHairColor !== undefined)
    items.push({ attributeDefinitionId: "cattr-hair-color", value: data.currentHairColor });
  if (data.weight !== undefined)
    items.push({ attributeDefinitionId: "cattr-weight", value: data.weight != null ? String(data.weight) : "" });
  if (data.build !== undefined)
    items.push({ attributeDefinitionId: "cattr-build", value: data.build });
  if (data.breastSize !== undefined)
    items.push({ attributeDefinitionId: "cattr-breast-size", value: data.breastSize, notes: data.breastDescription ?? null });
  for (const a of data.attributes ?? [])
    items.push({ attributeDefinitionId: a.definitionId, value: a.value });
  return items;
}

// Replace an era's deltas for each provided attribute (delete-then-create).
async function replaceEraScalarDeltas(
  tx: Prisma.TransactionClient,
  eraId: string,
  items: ScalarDeltaItem[],
  date: Date | null,
  datePrecision: DatePrecision,
) {
  for (const item of items) {
    await tx.scalarDelta.deleteMany({
      where: { eraId, attributeDefinitionId: item.attributeDefinitionId },
    });
    if (item.value.trim() !== "") {
      await tx.scalarDelta.create({
        data: {
          eraId,
          attributeDefinitionId: item.attributeDefinitionId,
          value: item.value,
          notes: item.notes ?? null,
          date,
          datePrecision,
        },
      });
    }
  }
}

export async function recordPhysicalChangeAction(
  personId: string,
  data: PhysicalChangeData,
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      const date = data.date ? new Date(data.date) : null;
      const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;

      await ensureCatalogEntry("hair", data.currentHairColor);

      await prisma.$transaction(async (tx) => {
        const eraId = await findOrCreateEraForDate(tx, personId, date, precision);
        await replaceEraScalarDeltas(tx, eraId, buildPhysicalDeltaItems(data), date, precision);
        await recomputePersonCurrentState(tx, personId);
      });

      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

// `eraId` identifies the physical change being edited (its era's scalar deltas).
export async function updatePhysicalChangeAction(
  eraId: string,
  personId: string,
  data: PhysicalChangeData,
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      const date = data.date ? new Date(data.date) : null;
      const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;

      await ensureCatalogEntry("hair", data.currentHairColor);

      await prisma.$transaction(async (tx) => {
        await replaceEraScalarDeltas(tx, eraId, buildPhysicalDeltaItems(data), date, precision);
        await recomputePersonCurrentState(tx, personId);
      });

      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

// ─── Era Batch/Edit/Delete Actions ──────────────────────────────────────

export async function createEraBatchAction(
  personId: string,
  data: CreateEraBatchInput,
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await createEraBatch(personId, data);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function updateEraAction(
  id: string,
  personId: string,
  data: {
    label?: string;
    date?: string;
    datePrecision?: string;
    notes?: string;
  },
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await updateEra(id, {
        ...data,
        datePrecision: data.datePrecision as "UNKNOWN" | "YEAR" | "MONTH" | "DAY" | undefined,
      });
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function deleteEraAction(
  id: string,
  personId: string,
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteEra(id);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

// ── Hero Visibility ───────────────────────────────────────────────────────────

export async function toggleEntityHeroVisibility(
  entityType: "bodyMark" | "bodyModification" | "cosmeticProcedure",
  entityId: string,
  visible: boolean,
  personId: string,
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      switch (entityType) {
        case "bodyMark":
          await prisma.bodyMark.update({ where: { id: entityId }, data: { heroVisible: visible } });
          break;
        case "bodyModification":
          await prisma.bodyModification.update({ where: { id: entityId }, data: { heroVisible: visible } });
          break;
        case "cosmeticProcedure":
          await prisma.cosmeticProcedure.update({ where: { id: entityId }, data: { heroVisible: visible } });
          break;
      }
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}
