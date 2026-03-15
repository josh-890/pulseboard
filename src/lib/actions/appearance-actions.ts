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

type ActionResult = { success: boolean; error?: string };

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
): Promise<ActionResult> {
  try {
    const date = data.date ? new Date(data.date) : null;
    const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;

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
      await tx.bodyMarkEvent.create({
        data: {
          bodyMarkId: mark.id,
          personaId,
          eventType: "added",
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
  },
): Promise<ActionResult> {
  try {
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
): Promise<ActionResult> {
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
): Promise<ActionResult> {
  try {
    await createBodyMarkEventRecord({
      bodyMarkId: data.bodyMarkId,
      personaId: data.personaId,
      eventType: data.eventType as BodyMarkEventType,
      notes: data.notes,
    });
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
): Promise<ActionResult> {
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
): Promise<ActionResult> {
  try {
    const date = data.date ? new Date(data.date) : null;
    const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;

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
      await tx.bodyModificationEvent.create({
        data: {
          bodyModificationId: mod.id,
          personaId,
          eventType: "added",
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
  },
): Promise<ActionResult> {
  try {
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
): Promise<ActionResult> {
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
): Promise<ActionResult> {
  try {
    await createBodyModificationEventRecord({
      bodyModificationId: data.bodyModificationId,
      personaId: data.personaId,
      eventType: data.eventType as BodyModificationEventType,
      notes: data.notes,
    });
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
): Promise<ActionResult> {
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
): Promise<ActionResult> {
  try {
    const date = data.date ? new Date(data.date) : null;
    const precision = (data.datePrecision ?? "UNKNOWN") as DatePrecision;

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
      await tx.cosmeticProcedureEvent.create({
        data: {
          cosmeticProcedureId: proc.id,
          personaId,
          eventType: "performed",
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
  },
): Promise<ActionResult> {
  try {
    await updateCosmeticProcedureRecord(id, { id, ...data });
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
): Promise<ActionResult> {
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
): Promise<ActionResult> {
  try {
    await createCosmeticProcedureEventRecord({
      cosmeticProcedureId: data.cosmeticProcedureId,
      personaId: data.personaId,
      eventType: data.eventType as CosmeticProcedureEventType,
      notes: data.notes,
    });
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
): Promise<ActionResult> {
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
): Promise<ActionResult> {
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

// ─── Persona Batch/Edit/Delete Actions ──────────────────────────────────────

export async function createPersonaBatchAction(
  personId: string,
  data: CreatePersonaBatchInput,
): Promise<ActionResult> {
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
): Promise<ActionResult> {
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
): Promise<ActionResult> {
  try {
    await deletePersona(id);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}
