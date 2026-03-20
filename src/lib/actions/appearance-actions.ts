"use server";

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
  updateBodyMarkRecord,
  deleteBodyMarkRecord,
  createBodyMarkEventRecord,
  deleteBodyMarkEventRecord,
} from "@/lib/services/person-service";
import {
  updateBodyModificationRecord,
  deleteBodyModificationRecord,
  createBodyModificationEventRecord,
  deleteBodyModificationEventRecord,
} from "@/lib/services/body-modification-service";
import {
  updateCosmeticProcedureRecord,
  deleteCosmeticProcedureRecord,
  createCosmeticProcedureEventRecord,
  deleteCosmeticProcedureEventRecord,
} from "@/lib/services/cosmetic-procedure-service";
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
    status?: string;
    date?: string | null;
    datePrecision?: string;
  },
): Promise<ActionResultWithId> {
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
          status: (data.status ?? "present") as BodyMarkStatus,
        },
      });
      markId = mark.id;
      await tx.bodyMarkEvent.create({
        data: {
          bodyMarkId: mark.id,
          personaId,
          eventType: "added",
        },
      });
    });

    revalidatePath(`/people/${personId}`);
    return { success: true, id: markId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
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
    status?: string;
    date?: string | null;
    datePrecision?: string;
  },
): Promise<ActionResultWithId> {
  try {
    const hasDateChange = data.date !== undefined || data.datePrecision !== undefined;

    if (hasDateChange) {
      const parsedDate = data.date ? new Date(data.date) : null;
      const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;

      await prisma.$transaction(async (tx) => {
        // Find initial "added" event
        const initialEvent = await tx.bodyMarkEvent.findFirst({
          where: { bodyMarkId: id, eventType: "added" },
        });

        if (initialEvent) {
          const targetPersonaId = await findOrCreatePersonaForDate(tx, personId, parsedDate, precision);
          if (targetPersonaId !== initialEvent.personaId) {
            await tx.bodyMarkEvent.update({
              where: { id: initialEvent.id },
              data: { personaId: targetPersonaId },
            });
          }
        }

        // Update entity fields
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
            status: data.status as BodyMarkStatus | undefined,
          },
        });
      });
    } else {
      await updateBodyMarkRecord(id, {
        type: data.type as BodyMarkType | undefined,
        bodyRegion: data.bodyRegion,
        bodyRegions: data.bodyRegions,
        side: data.side,
        position: data.position,
        description: data.description,
        motif: data.motif,
        colors: data.colors,
        size: data.size,
        status: data.status as BodyMarkStatus | undefined,
      });
    }

    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function deleteBodyMarkAction(
  id: string,
  personId: string,
): Promise<ActionResultWithId> {
  try {
    await deleteBodyMarkRecord(id);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function createBodyMarkEventAction(
  personId: string,
  data: {
    bodyMarkId: string;
    personaId: string;
    eventType: string;
    notes?: string;
  },
): Promise<ActionResultWithId> {
  try {
    await createBodyMarkEventRecord({
      bodyMarkId: data.bodyMarkId,
      personaId: data.personaId,
      eventType: data.eventType as BodyMarkEventType,
      notes: data.notes,
    });

    // Auto-update entity status based on event type
    if (data.eventType === "removed" || data.eventType === "modified") {
      await prisma.bodyMark.update({
        where: { id: data.bodyMarkId },
        data: { status: data.eventType as BodyMarkStatus },
      });
    }

    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function deleteBodyMarkEventAction(
  id: string,
  personId: string,
): Promise<ActionResultWithId> {
  try {
    await deleteBodyMarkEventRecord(id);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
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
    status?: string;
    date?: string | null;
    datePrecision?: string;
  },
): Promise<ActionResultWithId> {
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
          status: (data.status ?? "present") as BodyModificationStatus,
        },
      });
      modId = mod.id;
      await tx.bodyModificationEvent.create({
        data: {
          bodyModificationId: mod.id,
          personaId,
          eventType: "added",
        },
      });
    });

    revalidatePath(`/people/${personId}`);
    return { success: true, id: modId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
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
    status?: string;
    date?: string | null;
    datePrecision?: string;
  },
): Promise<ActionResultWithId> {
  try {
    const hasDateChange = data.date !== undefined || data.datePrecision !== undefined;

    if (hasDateChange) {
      const parsedDate = data.date ? new Date(data.date) : null;
      const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;

      await prisma.$transaction(async (tx) => {
        const initialEvent = await tx.bodyModificationEvent.findFirst({
          where: { bodyModificationId: id, eventType: "added" },
        });

        if (initialEvent) {
          const targetPersonaId = await findOrCreatePersonaForDate(tx, personId, parsedDate, precision);
          if (targetPersonaId !== initialEvent.personaId) {
            await tx.bodyModificationEvent.update({
              where: { id: initialEvent.id },
              data: { personaId: targetPersonaId },
            });
          }
        }

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
            status: data.status as BodyModificationStatus | undefined,
          },
        });
      });
    } else {
      await updateBodyModificationRecord(id, {
        id,
        type: data.type as BodyModificationType | undefined,
        bodyRegion: data.bodyRegion,
        bodyRegions: data.bodyRegions,
        side: data.side,
        position: data.position,
        description: data.description,
        material: data.material,
        gauge: data.gauge,
        status: data.status as BodyModificationStatus | undefined,
      });
    }

    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function deleteBodyModificationAction(
  id: string,
  personId: string,
): Promise<ActionResultWithId> {
  try {
    await deleteBodyModificationRecord(id);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function createBodyModificationEventAction(
  personId: string,
  data: {
    bodyModificationId: string;
    personaId: string;
    eventType: string;
    notes?: string;
  },
): Promise<ActionResultWithId> {
  try {
    await createBodyModificationEventRecord({
      bodyModificationId: data.bodyModificationId,
      personaId: data.personaId,
      eventType: data.eventType as BodyModificationEventType,
      notes: data.notes,
    });

    // Auto-update entity status based on event type
    if (data.eventType === "removed" || data.eventType === "modified") {
      await prisma.bodyModification.update({
        where: { id: data.bodyModificationId },
        data: { status: data.eventType as BodyModificationStatus },
      });
    }

    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function deleteBodyModificationEventAction(
  id: string,
  personId: string,
): Promise<ActionResultWithId> {
  try {
    await deleteBodyModificationEventRecord(id);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
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
    status?: string;
    date?: string | null;
    datePrecision?: string;
  },
): Promise<ActionResultWithId> {
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
          status: data.status ?? "completed",
        },
      });
      procId = proc.id;
      await tx.cosmeticProcedureEvent.create({
        data: {
          cosmeticProcedureId: proc.id,
          personaId,
          eventType: "performed",
        },
      });
    });

    revalidatePath(`/people/${personId}`);
    return { success: true, id: procId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
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
    status?: string;
    date?: string | null;
    datePrecision?: string;
  },
): Promise<ActionResultWithId> {
  try {
    const hasDateChange = data.date !== undefined || data.datePrecision !== undefined;

    if (hasDateChange) {
      const parsedDate = data.date ? new Date(data.date) : null;
      const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;

      await prisma.$transaction(async (tx) => {
        const initialEvent = await tx.cosmeticProcedureEvent.findFirst({
          where: { cosmeticProcedureId: id, eventType: "performed" },
        });

        if (initialEvent) {
          const targetPersonaId = await findOrCreatePersonaForDate(tx, personId, parsedDate, precision);
          if (targetPersonaId !== initialEvent.personaId) {
            await tx.cosmeticProcedureEvent.update({
              where: { id: initialEvent.id },
              data: { personaId: targetPersonaId },
            });
          }
        }

        await tx.cosmeticProcedure.update({
          where: { id },
          data: {
            type: data.type,
            bodyRegion: data.bodyRegion,
            bodyRegions: data.bodyRegions,
            description: data.description,
            provider: data.provider,
            status: data.status,
          },
        });
      });
    } else {
      await updateCosmeticProcedureRecord(id, { id, ...data });
    }

    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function deleteCosmeticProcedureAction(
  id: string,
  personId: string,
): Promise<ActionResultWithId> {
  try {
    await deleteCosmeticProcedureRecord(id);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function createCosmeticProcedureEventAction(
  personId: string,
  data: {
    cosmeticProcedureId: string;
    personaId: string;
    eventType: string;
    notes?: string;
  },
): Promise<ActionResultWithId> {
  try {
    await createCosmeticProcedureEventRecord({
      cosmeticProcedureId: data.cosmeticProcedureId,
      personaId: data.personaId,
      eventType: data.eventType as CosmeticProcedureEventType,
      notes: data.notes,
    });

    // Auto-update entity status based on event type
    if (data.eventType === "reversed" || data.eventType === "revised") {
      await prisma.cosmeticProcedure.update({
        where: { id: data.cosmeticProcedureId },
        data: { status: data.eventType },
      });
    }

    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function deleteCosmeticProcedureEventAction(
  id: string,
  personId: string,
): Promise<ActionResultWithId> {
  try {
    await deleteCosmeticProcedureEventRecord(id);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
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
    visionAids?: string;
    fitnessLevel?: string;
  },
): Promise<ActionResultWithId> {
  try {
    const date = data.date ? new Date(data.date) : null;
    const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;

    await prisma.$transaction(async (tx) => {
      const personaId = await findOrCreatePersonaForDate(tx, personId, date, precision);
      await tx.personaPhysical.upsert({
        where: { personaId },
        create: {
          personaId,
          currentHairColor: data.currentHairColor ?? null,
          weight: data.weight ?? null,
          build: data.build ?? null,
          visionAids: data.visionAids ?? null,
          fitnessLevel: data.fitnessLevel ?? null,
        },
        update: {
          ...(data.currentHairColor !== undefined && { currentHairColor: data.currentHairColor || null }),
          ...(data.weight !== undefined && { weight: data.weight || null }),
          ...(data.build !== undefined && { build: data.build || null }),
          ...(data.visionAids !== undefined && { visionAids: data.visionAids || null }),
          ...(data.fitnessLevel !== undefined && { fitnessLevel: data.fitnessLevel || null }),
        },
      });
    });

    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function updatePhysicalChangeAction(
  physicalId: string,
  personId: string,
  data: {
    currentHairColor?: string;
    weight?: number;
    build?: string;
    visionAids?: string;
    fitnessLevel?: string;
    date?: string | null;
    datePrecision?: string;
  },
): Promise<ActionResultWithId> {
  try {
    const parsedDate = data.date ? new Date(data.date) : null;
    const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;

    await prisma.$transaction(async (tx) => {
      // Find the existing physical change + its persona
      const existing = await tx.personaPhysical.findUniqueOrThrow({
        where: { id: physicalId },
        include: { persona: true },
      });

      const oldPersonaId = existing.personaId;

      // Determine if the date changed → need to move to a different persona
      const hasDateChange = data.date !== undefined || data.datePrecision !== undefined;
      let targetPersonaId = oldPersonaId;

      if (hasDateChange) {
        targetPersonaId = await findOrCreatePersonaForDate(tx, personId, parsedDate, precision);
      }

      const fieldData = {
        currentHairColor: data.currentHairColor !== undefined ? (data.currentHairColor || null) : existing.currentHairColor,
        weight: data.weight !== undefined ? (data.weight || null) : existing.weight,
        build: data.build !== undefined ? (data.build || null) : existing.build,
        visionAids: data.visionAids !== undefined ? (data.visionAids || null) : existing.visionAids,
        fitnessLevel: data.fitnessLevel !== undefined ? (data.fitnessLevel || null) : existing.fitnessLevel,
      };

      if (targetPersonaId !== oldPersonaId) {
        // Delete old physical change
        await tx.personaPhysical.delete({ where: { id: physicalId } });
        // Upsert on new persona (may already have a physical change)
        await tx.personaPhysical.upsert({
          where: { personaId: targetPersonaId },
          create: { personaId: targetPersonaId, ...fieldData },
          update: fieldData,
        });
      } else {
        // Same persona — just update fields
        await tx.personaPhysical.update({
          where: { id: physicalId },
          data: fieldData,
        });
      }
    });

    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

// ─── Persona Batch/Edit/Delete Actions ──────────────────────────────────────

export async function createPersonaBatchAction(
  personId: string,
  data: CreatePersonaBatchInput,
): Promise<ActionResultWithId> {
  try {
    await createPersonaBatch(personId, data);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
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
}

export async function deletePersonaAction(
  id: string,
  personId: string,
): Promise<ActionResultWithId> {
  try {
    await deletePersona(id);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}
