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
  autoClusterDeltaIntoDraftEra,
  getBaselineEraId,
  deleteDraftEraIfEmpty,
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
import {
  recomputeBodyMarkStatus,
  recomputeBodyModificationStatus,
  recomputeCosmeticProcedureStatus,
} from "@/lib/services/cascade-helpers";
import type { SimpleActionResult } from "@/lib/types";

type ActionResultWithId = SimpleActionResult & { id?: string };

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
        await recomputeBodyMarkStatus(tx, data.bodyMarkId);
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
        await recomputeBodyMarkStatus(tx, data.bodyMarkId);
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
      await recomputeBodyMarkStatus(prisma, resolvedBodyMarkId);
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

        await recomputeBodyModificationStatus(tx, data.bodyModificationId);
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

        await recomputeBodyModificationStatus(tx, data.bodyModificationId);
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

      await recomputeBodyModificationStatus(prisma, resolvedId);
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

        await recomputeCosmeticProcedureStatus(tx, data.cosmeticProcedureId);
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

        await recomputeCosmeticProcedureStatus(tx, data.cosmeticProcedureId);
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

      await recomputeCosmeticProcedureStatus(prisma, resolvedId);
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
  breastDescription?: string;
  // Slice 16 follow-up: `isVerifiedUnknown` records "user confirmed there's no
  // value" for this attribute. Forces stored value to "" so the catalog
  // value-shape invariant holds; the fold writes the sentinel
  // `"__UNKNOWN__"` into PersonCurrentState.baselineAttributes.
  attributes?: { definitionId: string; value: string; isVerifiedUnknown?: boolean }[];
  // Slice 16 follow-up: verified-unknown flags for the 4 core scalar attrs
  // (Hair Color, Weight, Build, Breast Size) that have hardcoded UI in the
  // record-change sheet. When set, the matching core field's delta is
  // written with isVerifiedUnknown=true and value="" regardless of any
  // non-empty value passed in the top-level field.
  coreAttrUnknown?: {
    hairColor?: boolean;
    weight?: boolean;
    build?: boolean;
    breastSize?: boolean;
  };
  // Phase G Slice 4 / ADR-0007: optional cause for the whole change set.
  // Stored on each ScalarDelta this change creates; drives the AttributeStatus
  // derivation (NATURAL / ENHANCED / RESTORED). Defaults to NATURAL.
  cause?: "NATURAL" | "SURGICAL" | "OTHER";
  // Phase G Slice 7 / ADR-0006: where the delta lands.
  //  - 'on-date'  → auto-cluster into a draft Era around `date` (±N months)
  //  - 'dateless' → land in the person's dateless draft Era ("I don't know when")
  //  - 'baseline' → land on Baseline ("this was always true")
  // Default 'on-date' if `date` is set, else 'baseline' (back-compat).
  intent?: "on-date" | "dateless" | "baseline";
};

type ScalarDeltaItem = {
  attributeDefinitionId: string;
  value: string;
  notes?: string | null;
  isVerifiedUnknown?: boolean;
};

// Map a physical-change form payload to ScalarDelta items.
function buildPhysicalDeltaItems(data: PhysicalChangeData): ScalarDeltaItem[] {
  const items: ScalarDeltaItem[] = [];
  const u = data.coreAttrUnknown ?? {};
  if (data.currentHairColor !== undefined || u.hairColor)
    items.push({
      attributeDefinitionId: "cattr-hair-color",
      value: u.hairColor ? "" : (data.currentHairColor ?? ""),
      isVerifiedUnknown: u.hairColor ?? false,
    });
  if (data.weight !== undefined || u.weight)
    items.push({
      attributeDefinitionId: "cattr-weight",
      value: u.weight ? "" : (data.weight != null ? String(data.weight) : ""),
      isVerifiedUnknown: u.weight ?? false,
    });
  if (data.build !== undefined || u.build)
    items.push({
      attributeDefinitionId: "cattr-build",
      value: u.build ? "" : (data.build ?? ""),
      isVerifiedUnknown: u.build ?? false,
    });
  if (data.breastSize !== undefined || u.breastSize)
    items.push({
      attributeDefinitionId: "cattr-breast-size",
      value: u.breastSize ? "" : (data.breastSize ?? ""),
      notes: data.breastDescription ?? null,
      isVerifiedUnknown: u.breastSize ?? false,
    });
  for (const a of data.attributes ?? [])
    items.push({
      attributeDefinitionId: a.definitionId,
      value: a.value,
      isVerifiedUnknown: a.isVerifiedUnknown ?? false,
    });
  return items;
}

// Replace an era's deltas for each provided attribute (delete-then-create).
async function replaceEraScalarDeltas(
  tx: Prisma.TransactionClient,
  eraId: string,
  items: ScalarDeltaItem[],
  date: Date | null,
  datePrecision: DatePrecision,
  cause: "NATURAL" | "SURGICAL" | "OTHER" = "NATURAL",
) {
  for (const item of items) {
    await tx.scalarDelta.deleteMany({
      where: { eraId, attributeDefinitionId: item.attributeDefinitionId },
    });
    // Verified-unknown writes a real row with empty value + flag; the SQL
    // fold substitutes the "__UNKNOWN__" sentinel into baselineAttributes.
    if (item.isVerifiedUnknown) {
      await tx.scalarDelta.create({
        data: {
          eraId,
          attributeDefinitionId: item.attributeDefinitionId,
          value: "",
          notes: item.notes ?? null,
          date,
          datePrecision,
          cause,
          isVerifiedUnknown: true,
        },
      });
    } else if (item.value.trim() !== "") {
      await tx.scalarDelta.create({
        data: {
          eraId,
          attributeDefinitionId: item.attributeDefinitionId,
          value: item.value,
          notes: item.notes ?? null,
          date,
          datePrecision,
          cause,
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
      const intent: "on-date" | "dateless" | "baseline" =
        data.intent ?? (date ? "on-date" : "baseline");

      await ensureCatalogEntry("hair", data.currentHairColor);

      await prisma.$transaction(async (tx) => {
        let eraId: string;
        if (intent === "baseline") {
          eraId = await getBaselineEraId(tx, personId);
        } else if (intent === "dateless") {
          eraId = await autoClusterDeltaIntoDraftEra(tx, personId, null, "UNKNOWN");
        } else {
          // 'on-date'
          eraId = await autoClusterDeltaIntoDraftEra(tx, personId, date, precision);
        }
        // Baseline-fill drops the per-delta date; the dated/dateless intents
        // keep the date on the delta itself (Era is just the cluster bucket).
        const deltaDate = intent === "baseline" ? null : date;
        const deltaPrecision = intent === "baseline" ? "UNKNOWN" : precision;
        await replaceEraScalarDeltas(
          tx,
          eraId,
          buildPhysicalDeltaItems(data),
          deltaDate,
          deltaPrecision as DatePrecision,
          data.cause ?? "NATURAL",
        );
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
// Phase G Slice 8 / ADR-0006: on save, re-route to a different Era when the
// source is a draft (or baseline + explicit intent change). Curated Eras
// retain sticky membership — date can still be edited, but the deltas stay
// in their source Era.
export async function updatePhysicalChangeAction(
  eraId: string,
  personId: string,
  data: PhysicalChangeData,
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      const date = data.date ? new Date(data.date) : null;
      const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;
      const newIntent: "on-date" | "dateless" | "baseline" =
        data.intent ?? (date ? "on-date" : "baseline");

      await ensureCatalogEntry("hair", data.currentHairColor);

      await prisma.$transaction(async (tx) => {
        const source = await tx.era.findUniqueOrThrow({
          where: { id: eraId },
          select: { id: true, isDraft: true, isBaseline: true },
        });

        // Compute the target Era based on the user's chosen intent.
        let targetEraId: string;
        if (newIntent === "baseline") {
          targetEraId = await getBaselineEraId(tx, personId);
        } else if (newIntent === "dateless") {
          targetEraId = await autoClusterDeltaIntoDraftEra(tx, personId, null, "UNKNOWN");
        } else {
          targetEraId = await autoClusterDeltaIntoDraftEra(tx, personId, date, precision);
        }

        // Sticky-only-for-curated rule:
        //  - source is curated (!isDraft && !isBaseline): never move
        //  - source is baseline: only move if user explicitly picked a
        //    non-baseline intent
        //  - source is draft: always re-cluster freely
        const canMove =
          source.isDraft ||
          (source.isBaseline && newIntent !== "baseline");
        const effectiveEraId = canMove ? targetEraId : source.id;

        // Baseline-fill drops the per-delta date; the dated/dateless intents
        // keep the date on the delta itself.
        const baselineLanding =
          canMove ? newIntent === "baseline" : source.isBaseline;
        const deltaDate = baselineLanding ? null : date;
        const deltaPrecision = baselineLanding ? "UNKNOWN" : precision;

        // If we're moving out of the source, clear the source's deltas for
        // the affected attribute IDs first (otherwise they'd remain orphaned
        // in the old Era).
        if (canMove && effectiveEraId !== source.id) {
          const items = buildPhysicalDeltaItems(data);
          if (items.length > 0) {
            await tx.scalarDelta.deleteMany({
              where: {
                eraId: source.id,
                attributeDefinitionId: { in: items.map((i) => i.attributeDefinitionId) },
              },
            });
          }
        }

        await replaceEraScalarDeltas(
          tx,
          effectiveEraId,
          buildPhysicalDeltaItems(data),
          deltaDate,
          deltaPrecision as DatePrecision,
          data.cause ?? "NATURAL",
        );

        // If we just emptied the source draft Era, garbage-collect it.
        if (canMove && effectiveEraId !== source.id) {
          await deleteDraftEraIfEmpty(tx, source.id);
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

// Phase G Slice 9 / ADR-0006: per-delta edit. Same sticky-only-for-curated
// routing as updatePhysicalChangeAction, but operates on one ScalarDelta —
// not all the deltas in an Era. Lets the user fix the date/intent of a
// single change without disturbing siblings (the natural unit for the
// Undated drawer, where unrelated changes pile up).
export type ScalarDeltaEdit = {
  value?: string;
  date?: string | null;
  datePrecision?: string;
  intent?: "on-date" | "dateless" | "baseline";
  cause?: "NATURAL" | "SURGICAL" | "OTHER";
  notes?: string | null;
};

export async function editScalarDeltaAction(
  deltaId: string,
  personId: string,
  data: ScalarDeltaEdit,
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      const date = data.date ? new Date(data.date) : null;
      const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;
      const newIntent: "on-date" | "dateless" | "baseline" =
        data.intent ?? (date ? "on-date" : "baseline");

      await prisma.$transaction(async (tx) => {
        const delta = await tx.scalarDelta.findUniqueOrThrow({
          where: { id: deltaId },
          select: {
            id: true,
            eraId: true,
            attributeDefinitionId: true,
            era: { select: { isDraft: true, isBaseline: true, personId: true } },
          },
        });
        if (delta.era.personId !== personId) {
          throw new Error("Delta does not belong to this person.");
        }
        const source = delta.era;
        const sourceEraId = delta.eraId;

        // Compute target Era using same routing as updatePhysicalChangeAction.
        let targetEraId: string;
        if (newIntent === "baseline") {
          targetEraId = await getBaselineEraId(tx, personId);
        } else if (newIntent === "dateless") {
          targetEraId = await autoClusterDeltaIntoDraftEra(tx, personId, null, "UNKNOWN");
        } else {
          targetEraId = await autoClusterDeltaIntoDraftEra(tx, personId, date, precision);
        }

        // Sticky rule: curated source never moves; baseline moves only on
        // explicit non-baseline intent; draft moves freely.
        const canMove =
          source.isDraft ||
          (source.isBaseline && newIntent !== "baseline");
        const effectiveEraId = canMove ? targetEraId : sourceEraId;

        const baselineLanding =
          canMove ? newIntent === "baseline" : source.isBaseline;
        const deltaDate = baselineLanding ? null : date;
        const deltaPrecision = baselineLanding ? "UNKNOWN" : precision;

        // If a target row exists for the same (era, attrDef), delete it first
        // — replaceEraScalarDeltas would do the same for whole-Era edits.
        if (effectiveEraId !== sourceEraId) {
          await tx.scalarDelta.deleteMany({
            where: {
              eraId: effectiveEraId,
              attributeDefinitionId: delta.attributeDefinitionId,
              id: { not: deltaId },
            },
          });
        }

        await tx.scalarDelta.update({
          where: { id: deltaId },
          data: {
            eraId: effectiveEraId,
            ...(data.value !== undefined && { value: data.value.trim() }),
            date: deltaDate,
            datePrecision: deltaPrecision as DatePrecision,
            ...(data.cause !== undefined && { cause: data.cause }),
            ...(data.notes !== undefined && { notes: data.notes }),
          },
        });

        // GC the source draft Era if it just lost its last member.
        if (canMove && effectiveEraId !== sourceEraId) {
          await deleteDraftEraIfEmpty(tx, sourceEraId);
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

// Phase G Slice 9 / ADR-0006: promote a draft Era to curated, with optional
// split. `splitDeltaIds` are the IDs of member deltas the user *unchecked*
// in the promotion sheet — they are moved out into per-date draft Eras via
// autoClusterDeltaIntoDraftEra (using each delta's own date). The remaining
// deltas + non-scalar events stay in the (now curated) source Era.
//
// Refuses to promote an Era that would end up empty after the split.
export async function promoteEraAction(
  eraId: string,
  personId: string,
  data: { name: string; splitDeltaIds?: string[] },
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      const name = data.name.trim();
      if (!name) return { success: false, error: "Name is required." };

      await prisma.$transaction(async (tx) => {
        const era = await tx.era.findUniqueOrThrow({
          where: { id: eraId },
          select: { id: true, isBaseline: true, personId: true, scalarDeltas: { select: { id: true } } },
        });
        if (era.personId !== personId) {
          throw new Error("Era does not belong to this person.");
        }
        if (era.isBaseline) {
          throw new Error("Baseline cannot be promoted.");
        }

        const splitIds = (data.splitDeltaIds ?? []).filter((id) =>
          era.scalarDeltas.some((d) => d.id === id),
        );
        const remainingCount = era.scalarDeltas.length - splitIds.length;
        // Allow promoting an Era with zero deltas as long as it has events
        // (body marks / mods / etc.). Block only if ALL members would leave.
        if (remainingCount === 0 && splitIds.length > 0) {
          const [marks, mods, di, ie, se, contribs] = await Promise.all([
            tx.bodyMarkEvent.count({ where: { eraId } }),
            tx.bodyModificationEvent.count({ where: { eraId } }),
            tx.digitalIdentityEvent.count({ where: { eraId } }),
            tx.interestEvent.count({ where: { eraId } }),
            tx.personSkillEvent.count({ where: { eraId } }),
            tx.sessionContribution.count({ where: { eraId } }),
          ]);
          if (marks + mods + di + ie + se + contribs === 0) {
            throw new Error("Cannot split out every member — at least one must stay in the curated Era.");
          }
        }

        // Move each split delta to its own auto-clustered draft Era based on
        // its own date. (May join an existing draft if one fits the date.)
        for (const id of splitIds) {
          const d = await tx.scalarDelta.findUniqueOrThrow({
            where: { id },
            select: { date: true, datePrecision: true, attributeDefinitionId: true },
          });
          const targetEraId = d.date
            ? await autoClusterDeltaIntoDraftEra(tx, personId, d.date, d.datePrecision)
            : await autoClusterDeltaIntoDraftEra(tx, personId, null, "UNKNOWN");
          if (targetEraId === eraId) continue; // no-op if cluster lands back here
          await tx.scalarDelta.deleteMany({
            where: {
              eraId: targetEraId,
              attributeDefinitionId: d.attributeDefinitionId,
              id: { not: id },
            },
          });
          await tx.scalarDelta.update({
            where: { id },
            data: { eraId: targetEraId },
          });
        }

        // Promote the source Era. updateEra already clears isDraft.
        await tx.era.update({
          where: { id: eraId },
          data: { label: name, isDraft: false },
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

// Phase G Slice 15: per-instance Pin/PinOff (hero-visibility toggle) was
// removed when the hero card switched to type-presence chips driven by
// PersonCurrentState.presentBodyFeatureTypes. The legacy
// toggleEntityHeroVisibility action + its columns are gone with this
// commit; if a re-introduction is ever needed, build it on the new
// presence-types model rather than reviving these columns.
