"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  createPersona,
  updatePersona,
  deletePersona,
  getCurrentPersonState,
  getActiveTraitsAtSequence,
} from "@/lib/services/persona-service";
import { personaFormSchema } from "@/lib/validations/persona";

type ActionResult = { success: true } | { success: false; error: string };

export async function addPersona(
  personId: string,
  data: unknown,
): Promise<ActionResult> {
  const parsed = personaFormSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { effectiveDate, note, jobTitle, department, phone, address, traits } =
    parsed.data;

  try {
    const person = await prisma.person.findUnique({ where: { id: personId } });
    if (!person) {
      return { success: false, error: "Person not found" };
    }

    await createPersona({
      personId,
      effectiveDate: new Date(effectiveDate),
      note: note || undefined,
      jobTitle: jobTitle || null,
      department: department || null,
      phone: phone || null,
      address: address || null,
      traits: traits?.map((t) => ({
        traitCategoryId: t.traitCategoryId,
        name: t.name,
        action: t.action,
      })),
    });

    await prisma.activity.create({
      data: {
        title: `Added persona for "${person.firstName} ${person.lastName}"`,
        time: new Date(),
        type: "note",
      },
    });

    revalidatePath(`/people/${personId}`);
    revalidatePath("/people");
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to create persona" };
  }
}

export async function editPersona(
  personaId: string,
  personId: string,
  data: unknown,
): Promise<ActionResult> {
  const parsed = personaFormSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { effectiveDate, note, jobTitle, department, phone, address, traits } =
    parsed.data;

  try {
    await updatePersona(personaId, {
      effectiveDate: new Date(effectiveDate),
      note: note || null,
      jobTitle: jobTitle || null,
      department: department || null,
      phone: phone || null,
      address: address || null,
      traits: traits?.map((t) => ({
        traitCategoryId: t.traitCategoryId,
        name: t.name,
        action: t.action,
      })),
    });

    revalidatePath(`/people/${personId}`);
    revalidatePath("/people");
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update persona" };
  }
}

export async function removePersona(
  personaId: string,
  personId: string,
): Promise<ActionResult> {
  try {
    const person = await prisma.person.findUnique({ where: { id: personId } });
    if (!person) {
      return { success: false, error: "Person not found" };
    }

    await deletePersona(personaId);

    await prisma.activity.create({
      data: {
        title: `Removed persona from "${person.firstName} ${person.lastName}"`,
        time: new Date(),
        type: "note",
      },
    });

    revalidatePath(`/people/${personId}`);
    revalidatePath("/people");
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete persona" };
  }
}

export type RemovableTrait = {
  traitCategoryId: string;
  categoryName: string;
  name: string;
};

export async function fetchRemovableTraits(
  personId: string,
  beforeSequenceNum?: number,
): Promise<RemovableTrait[]> {
  if (beforeSequenceNum !== undefined) {
    const traits = await getActiveTraitsAtSequence(personId, beforeSequenceNum);
    return traits.map((t) => ({
      traitCategoryId: t.traitCategoryId,
      categoryName: t.categoryName,
      name: t.name,
    }));
  }

  const state = await getCurrentPersonState(personId);
  if (!state) return [];

  return state.traits.map((t) => ({
    traitCategoryId: t.traitCategoryId,
    categoryName: t.categoryName,
    name: t.name,
  }));
}
