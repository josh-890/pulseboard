"use server";

import { revalidatePath } from "next/cache";
import { createProjectSchema, updateProjectSchema } from "@/lib/validations/project";
import {
  createProjectRecord,
  updateProjectRecord,
  deleteProjectRecord,
} from "@/lib/services/project-service";

type ActionResult =
  | { success: true; id: string }
  | { success: false; error: { fieldErrors?: Record<string, string[]> } | string };

type DeleteResult = { success: boolean; error?: string };

export async function createProject(raw: unknown): Promise<ActionResult> {
  const parsed = createProjectSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten() };
  }

  try {
    const project = await createProjectRecord(parsed.data);
    revalidatePath("/projects");
    return { success: true, id: project.id };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

export async function updateProject(raw: unknown): Promise<ActionResult> {
  const parsed = updateProjectSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten() };
  }

  try {
    await updateProjectRecord(parsed.data.id, parsed.data);
    revalidatePath("/projects");
    revalidatePath(`/projects/${parsed.data.id}`);
    return { success: true, id: parsed.data.id };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

export async function deleteProject(id: string): Promise<DeleteResult> {
  try {
    await deleteProjectRecord(id);
    revalidatePath("/projects");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete project" };
  }
}
