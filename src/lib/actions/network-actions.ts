"use server";

import { revalidatePath } from "next/cache";
import { createNetworkSchema, updateNetworkSchema } from "@/lib/validations/network";
import {
  createNetworkRecord,
  updateNetworkRecord,
  deleteNetworkRecord,
} from "@/lib/services/network-service";

type ActionResult =
  | { success: true; id: string }
  | { success: false; error: { fieldErrors?: Record<string, string[]> } | string };

type DeleteResult = { success: boolean; error?: string };

export async function createNetwork(raw: unknown): Promise<ActionResult> {
  const parsed = createNetworkSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten() };
  }

  try {
    const network = await createNetworkRecord({
      ...parsed.data,
      website: parsed.data.website || undefined,
    });
    revalidatePath("/networks");
    return { success: true, id: network.id };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

export async function updateNetwork(raw: unknown): Promise<ActionResult> {
  const parsed = updateNetworkSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten() };
  }

  try {
    await updateNetworkRecord(parsed.data.id, {
      ...parsed.data,
      website: parsed.data.website || null,
    });
    revalidatePath("/networks");
    revalidatePath(`/networks/${parsed.data.id}`);
    return { success: true, id: parsed.data.id };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

export async function deleteNetwork(id: string): Promise<DeleteResult> {
  try {
    await deleteNetworkRecord(id);
    revalidatePath("/networks");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete network" };
  }
}
