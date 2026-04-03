"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import type {
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
  findOrCreatePersonaForDate,
  createPersonaBatch,
  updatePersona,
  deletePersona,
} from "@/lib/services/persona-service";
import type { CreatePersonaBatchInput } from "@/lib/validations/persona";
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
        const personaId = await findOrCreatePersonaForDate(tx, personId, date, precision);
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
            personaId,
            eventType: "added",
            date,
            datePrecision: precision,
          },
        });
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
            const targetPersonaId = await findOrCreatePersonaForDate(tx, personId, parsedDate, precision);
            await tx.bodyMarkEvent.update({
              where: { id: events[0].id },
              data: {
                personaId: targetPersonaId,
                date: parsedDate,
                datePrecision: precision,
              },
            });
          }
        }
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
        const personaId = await findOrCreatePersonaForDate(tx, personId, parsedDate, precision);

        await tx.bodyMarkEvent.create({
          data: {
            bodyMarkId: data.bodyMarkId,
            personaId,
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
        const targetPersonaId = await findOrCreatePersonaForDate(tx, personId, parsedDate, precision);

        await tx.bodyMarkEvent.update({
          where: { id: eventId },
          data: {
            personaId: targetPersonaId,
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
        const personaId = await findOrCreatePersonaForDate(tx, personId, date, precision);
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
            personaId,
            eventType: "added",
            date,
            datePrecision: precision,
          },
        });
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
            const targetPersonaId = await findOrCreatePersonaForDate(tx, personId, parsedDate, precision);
            await tx.bodyModificationEvent.update({
              where: { id: events[0].id },
              data: {
                personaId: targetPersonaId,
                date: parsedDate,
                datePrecision: precision,
              },
            });
          }
        }
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
        const personaId = await findOrCreatePersonaForDate(tx, personId, parsedDate, precision);

        await tx.bodyModificationEvent.create({
          data: {
            bodyModificationId: data.bodyModificationId,
            personaId,
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
        const targetPersonaId = await findOrCreatePersonaForDate(tx, personId, parsedDate, precision);

        await tx.bodyModificationEvent.update({
          where: { id: eventId },
          data: {
            personaId: targetPersonaId,
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
        const personaId = await findOrCreatePersonaForDate(tx, personId, date, precision);
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
            personaId,
            eventType: "performed",
            date,
            datePrecision: precision,
          },
        });
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
            const targetPersonaId = await findOrCreatePersonaForDate(tx, personId, parsedDate, precision);
            await tx.cosmeticProcedureEvent.update({
              where: { id: events[0].id },
              data: {
                personaId: targetPersonaId,
                date: parsedDate,
                datePrecision: precision,
              },
            });
          }
        }
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
        const personaId = await findOrCreatePersonaForDate(tx, personId, parsedDate, precision);

        await tx.cosmeticProcedureEvent.create({
          data: {
            cosmeticProcedureId: data.cosmeticProcedureId,
            personaId,
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
        const targetPersonaId = await findOrCreatePersonaForDate(tx, personId, parsedDate, precision);

        await tx.cosmeticProcedureEvent.update({
          where: { id: eventId },
          data: {
            personaId: targetPersonaId,
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

      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

// ─── Physical Change Action ─────────────────────────────────────────────────

export async function recordPhysicalChangeAction(
  personId: string,
  data: {
    date?: string | null;
    datePrecision?: string;
    currentHairColor?: string;
    weight?: number;
    build?: string;
    breastSize?: string;
    breastStatus?: string;
    breastDescription?: string;
    attributes?: { definitionId: string; value: string }[];
  },
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      const date = data.date ? new Date(data.date) : null;
      const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;

      await prisma.$transaction(async (tx) => {
        const personaId = await findOrCreatePersonaForDate(tx, personId, date, precision);
        const physical = await tx.personaPhysical.upsert({
          where: { personaId },
          create: {
            personaId,
            currentHairColor: data.currentHairColor ?? null,
            weight: data.weight ?? null,
            build: data.build ?? null,
            breastSize: data.breastSize ?? null,
            breastStatus: data.breastStatus ?? null,
            breastDescription: data.breastDescription ?? null,
            date,
            datePrecision: precision,
          },
          update: {
            ...(data.currentHairColor !== undefined && { currentHairColor: data.currentHairColor || null }),
            ...(data.weight !== undefined && { weight: data.weight || null }),
            ...(data.build !== undefined && { build: data.build || null }),
            ...(data.breastSize !== undefined && { breastSize: data.breastSize || null }),
            ...(data.breastStatus !== undefined && { breastStatus: data.breastStatus || null }),
            ...(data.breastDescription !== undefined && { breastDescription: data.breastDescription || null }),
            date,
            datePrecision: precision,
          },
        });

        // Upsert extensible attributes
        if (data.attributes && data.attributes.length > 0) {
          for (const attr of data.attributes) {
            await tx.personaPhysicalAttribute.upsert({
              where: {
                personaPhysicalId_attributeDefinitionId: {
                  personaPhysicalId: physical.id,
                  attributeDefinitionId: attr.definitionId,
                },
              },
              create: {
                personaPhysicalId: physical.id,
                attributeDefinitionId: attr.definitionId,
                value: attr.value,
              },
              update: { value: attr.value },
            });
          }
        }
      });

      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function updatePhysicalChangeAction(
  physicalId: string,
  personId: string,
  data: {
    currentHairColor?: string;
    weight?: number;
    build?: string;
    breastSize?: string;
    breastStatus?: string;
    breastDescription?: string;
    date?: string | null;
    datePrecision?: string;
    attributes?: { definitionId: string; value: string }[];
  },
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      const parsedDate = data.date ? new Date(data.date) : null;
      const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;

      await prisma.$transaction(async (tx) => {
        const existing = await tx.personaPhysical.findUniqueOrThrow({
          where: { id: physicalId },
          include: { persona: true },
        });

        const oldPersonaId = existing.personaId;
        const hasDateChange = data.date !== undefined || data.datePrecision !== undefined;
        let targetPersonaId = oldPersonaId;

        if (hasDateChange) {
          targetPersonaId = await findOrCreatePersonaForDate(tx, personId, parsedDate, precision);
        }

        const fieldData = {
          currentHairColor: data.currentHairColor !== undefined ? (data.currentHairColor || null) : existing.currentHairColor,
          weight: data.weight !== undefined ? (data.weight || null) : existing.weight,
          build: data.build !== undefined ? (data.build || null) : existing.build,
          breastSize: data.breastSize !== undefined ? (data.breastSize || null) : existing.breastSize,
          breastStatus: data.breastStatus !== undefined ? (data.breastStatus || null) : existing.breastStatus,
          breastDescription: data.breastDescription !== undefined ? (data.breastDescription || null) : existing.breastDescription,
          date: parsedDate,
          datePrecision: precision,
        };

        let newPhysicalId: string;
        if (targetPersonaId !== oldPersonaId) {
          await tx.personaPhysical.delete({ where: { id: physicalId } });
          const created = await tx.personaPhysical.upsert({
            where: { personaId: targetPersonaId },
            create: { personaId: targetPersonaId, ...fieldData },
            update: fieldData,
          });
          newPhysicalId = created.id;
        } else {
          await tx.personaPhysical.update({
            where: { id: physicalId },
            data: fieldData,
          });
          newPhysicalId = physicalId;
        }

        // Upsert extensible attributes
        if (data.attributes && data.attributes.length > 0) {
          for (const attr of data.attributes) {
            await tx.personaPhysicalAttribute.upsert({
              where: {
                personaPhysicalId_attributeDefinitionId: {
                  personaPhysicalId: newPhysicalId,
                  attributeDefinitionId: attr.definitionId,
                },
              },
              create: {
                personaPhysicalId: newPhysicalId,
                attributeDefinitionId: attr.definitionId,
                value: attr.value,
              },
              update: { value: attr.value },
            });
          }
        }
      });

      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

// ─── Persona Batch/Edit/Delete Actions ──────────────────────────────────────

export async function createPersonaBatchAction(
  personId: string,
  data: CreatePersonaBatchInput,
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await createPersonaBatch(personId, data);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function updatePersonaAction(
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
      await updatePersona(id, {
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

export async function deletePersonaAction(
  id: string,
  personId: string,
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await deletePersona(id);
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
