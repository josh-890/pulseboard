"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { projectFormSchema } from "@/lib/validations/project";

type ActionResult = { success: true } | { success: false; error: string };

export async function createProject(data: unknown): Promise<ActionResult> {
  const parsed = projectFormSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { name, description, status, tags, stakeholderId, leadId, memberIds } =
    parsed.data;

  try {
    const project = await prisma.project.create({
      data: {
        name,
        description,
        status,
        tags,
        stakeholderId,
        leadId,
      },
    });

    if (memberIds.length > 0) {
      await Promise.all(
        memberIds.map((personId) =>
          prisma.projectMember.create({
            data: { projectId: project.id, personId },
          }),
        ),
      );
    }

    await prisma.activity.create({
      data: {
        title: `Created project "${name}"`,
        time: new Date(),
        type: "task",
      },
    });

    revalidatePath("/projects");
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to create project" };
  }
}

export async function updateProject(
  id: string,
  data: unknown,
): Promise<ActionResult> {
  const parsed = projectFormSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { name, description, status, tags, stakeholderId, leadId, memberIds } =
    parsed.data;

  try {
    await prisma.project.update({
      where: { id },
      data: { name, description, status, tags, stakeholderId, leadId },
    });

    // Sync members: soft-delete removed, upsert current
    const existingMembers = await prisma.projectMember.findMany({
      where: { projectId: id },
    });

    // Soft-delete members no longer in the list
    const removedMembers = existingMembers.filter(
      (m) => !memberIds.includes(m.personId) && m.deletedAt === null,
    );
    await Promise.all(
      removedMembers.map((m) =>
        prisma.projectMember.update({
          where: { id: m.id },
          data: { deletedAt: new Date() },
        }),
      ),
    );

    // Upsert current members (restores soft-deleted ones)
    await Promise.all(
      memberIds.map((personId) =>
        prisma.projectMember.upsert({
          where: { projectId_personId: { projectId: id, personId } },
          create: { projectId: id, personId },
          update: { deletedAt: null },
        }),
      ),
    );

    await prisma.activity.create({
      data: {
        title: `Updated project "${name}"`,
        time: new Date(),
        type: "note",
      },
    });

    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update project" };
  }
}

export async function deleteProject(id: string): Promise<ActionResult> {
  try {
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return { success: false, error: "Project not found" };
    }

    const now = new Date();

    // Soft-delete the project
    await prisma.project.update({
      where: { id },
      data: { deletedAt: now },
    });

    // Soft-delete associated members
    await prisma.projectMember.updateMany({
      where: { projectId: id, deletedAt: null },
      data: { deletedAt: now },
    });

    await prisma.activity.create({
      data: {
        title: `Deleted project "${project.name}"`,
        time: now,
        type: "note",
      },
    });

    revalidatePath("/projects");
    revalidatePath("/");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete project" };
  }
}
