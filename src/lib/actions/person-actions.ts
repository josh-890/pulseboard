"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { createPersona } from "@/lib/services/persona-service";
import { personFormSchema } from "@/lib/validations/person";

type ActionResult = { success: true } | { success: false; error: string };

export async function createPerson(data: unknown): Promise<ActionResult> {
  const parsed = personFormSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { firstName, lastName, email, avatarColor } = parsed.data;

  try {
    const person = await prisma.person.create({
      data: { firstName, lastName, email, avatarColor },
    });

    // Auto-create baseline persona (seq 0) so profile is never empty
    await createPersona({
      personId: person.id,
      effectiveDate: new Date(),
      note: "Initial profile",
    });

    await prisma.activity.create({
      data: {
        title: `Added team member "${firstName} ${lastName}"`,
        time: new Date(),
        type: "task",
      },
    });

    revalidatePath("/people");
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return { success: false, error: "A person with this email already exists" };
    }
    return { success: false, error: "Failed to create person" };
  }
}

export async function updatePerson(
  id: string,
  data: unknown,
): Promise<ActionResult> {
  const parsed = personFormSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { firstName, lastName, email, avatarColor } = parsed.data;

  try {
    // Check email uniqueness (exclude self)
    const existing = await prisma.person.findFirst({
      where: { email, id: { not: id } },
    });
    if (existing) {
      return { success: false, error: "A person with this email already exists" };
    }

    await prisma.person.update({
      where: { id },
      data: { firstName, lastName, email, avatarColor },
    });

    await prisma.activity.create({
      data: {
        title: `Updated team member "${firstName} ${lastName}"`,
        time: new Date(),
        type: "note",
      },
    });

    revalidatePath("/people");
    revalidatePath(`/people/${id}`);
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update person" };
  }
}

export async function deletePerson(id: string): Promise<ActionResult> {
  try {
    const person = await prisma.person.findUnique({ where: { id } });
    if (!person) {
      return { success: false, error: "Person not found" };
    }

    // Guard: reject if person is stakeholder or lead on any project
    const [stakeholderCount, leadCount] = await Promise.all([
      prisma.project.count({ where: { stakeholderId: id } }),
      prisma.project.count({ where: { leadId: id } }),
    ]);

    if (stakeholderCount > 0 || leadCount > 0) {
      return {
        success: false,
        error:
          "Cannot delete this person because they are a stakeholder or lead on one or more projects. Reassign their roles first.",
      };
    }

    const now = new Date();

    // Soft-delete person
    await prisma.person.update({
      where: { id },
      data: { deletedAt: now },
    });

    // Soft-delete their memberships
    await prisma.projectMember.updateMany({
      where: { personId: id, deletedAt: null },
      data: { deletedAt: now },
    });

    await prisma.activity.create({
      data: {
        title: `Removed team member "${person.firstName} ${person.lastName}"`,
        time: now,
        type: "note",
      },
    });

    revalidatePath("/people");
    revalidatePath("/projects");
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete person" };
  }
}
