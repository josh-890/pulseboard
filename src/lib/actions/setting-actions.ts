"use server";

import { revalidatePath } from "next/cache";
import {
  updateProfileImageLabel as updateLabel,
  updateSkillLevelConfig,
} from "@/lib/services/setting-service";
import { z } from "zod";

const updateLabelSchema = z.object({
  slot: z.string().regex(/^p-img0[1-5]$/, "Invalid slot"),
  label: z.string().min(1, "Label is required").max(50, "Label too long"),
});

type ActionResult = { success: true } | { success: false; error: string };

export async function updateProfileImageLabel(
  data: unknown,
): Promise<ActionResult> {
  const parsed = updateLabelSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    await updateLabel(parsed.data.slot, parsed.data.label);
    revalidatePath("/settings");
    revalidatePath("/people");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update label" };
  }
}

const skillLevelConfigSchema = z.object({
  levels: z.array(
    z.object({
      level: z.number().int().min(1).max(5),
      label: z.string().min(1, "Label is required").max(30, "Label too long"),
      delta: z.number().min(-5.0, "Min delta is -5.0").max(5.0, "Max delta is 5.0"),
    }),
  ).length(5),
});

export async function updateSkillLevelConfigAction(
  data: unknown,
): Promise<ActionResult> {
  const parsed = skillLevelConfigSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    for (const row of parsed.data.levels) {
      await updateSkillLevelConfig(row.level, row.label, row.delta);
    }
    revalidatePath("/settings");
    revalidatePath("/people");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update skill level config" };
  }
}
