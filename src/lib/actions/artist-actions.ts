"use server";

import { revalidatePath } from "next/cache";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { createArtistSchema, updateArtistSchema } from "@/lib/validations/artist";
import {
  createArtist,
  updateArtist,
  deleteArtist,
} from "@/lib/services/artist-service";
import type { CrudActionResult, SimpleActionResult } from "@/lib/types";

export async function createArtistAction(raw: unknown): Promise<CrudActionResult> {
  return withTenantFromHeaders(async () => {
    const parsed = createArtistSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten() };
    }

    try {
      const artist = await createArtist(parsed.data);
      revalidatePath("/artists");
      return { success: true, id: artist.id };
    } catch {
      return { success: false, error: "Unexpected error" };
    }
  });
}

export async function updateArtistAction(raw: unknown): Promise<CrudActionResult> {
  return withTenantFromHeaders(async () => {
    const parsed = updateArtistSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten() };
    }

    try {
      await updateArtist(parsed.data.id, {
        name: parsed.data.name,
        nationality: parsed.data.nationality ?? null,
        bio: parsed.data.bio ?? null,
      });
      revalidatePath("/artists");
      revalidatePath(`/artists/${parsed.data.id}`);
      return { success: true, id: parsed.data.id };
    } catch {
      return { success: false, error: "Unexpected error" };
    }
  });
}

export async function deleteArtistAction(id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteArtist(id);
      revalidatePath("/artists");
      return { success: true };
    } catch {
      return { success: false, error: "Unexpected error" };
    }
  });
}
