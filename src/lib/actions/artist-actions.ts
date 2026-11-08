"use server";

import { revalidatePath } from "next/cache";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { createArtistSchema, updateArtistSchema } from "@/lib/validations/artist";
import {
  createArtist,
  updateArtist,
  deleteArtist,
  setArtistRating,
  setArtistText,
} from "@/lib/services/artist-service";
import {
  addArtistAlias,
  AliasRefused,
  linkCreditsToArtist,
  linkExactCredits,
  removeArtistAlias,
} from "@/lib/services/artist-credit-service";
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
        // Only what the form sent: the bio is edited on the page, not the sheet
        bio: parsed.data.bio,
        website: parsed.data.website,
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

// ─── Artist page (2026-11-08) ────────────────────────────────────────────────

function revalidateArtist(artistId: string) {
  revalidatePath(`/artists/${artistId}`);
  revalidatePath("/artists");
}

export async function setArtistRatingAction(artistId: string, rating: number | null): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await setArtistRating(artistId, rating);
      revalidateArtist(artistId);
      return { success: true };
    } catch (err) {
      console.error("[setArtistRatingAction]", err);
      return { success: false, error: "Could not save the rating" };
    }
  });
}

export async function setArtistTextAction(artistId: string, field: "bio" | "notes", text: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    if (field !== "bio" && field !== "notes") return { success: false, error: "Unknown field" };
    try {
      await setArtistText(artistId, field, text);
      revalidateArtist(artistId);
      return { success: true };
    } catch (err) {
      console.error("[setArtistTextAction]", err);
      return { success: false, error: "Could not save" };
    }
  });
}

type LinkResult = { success: true; linked: number } | { success: false; error: string };

export async function addArtistAliasAction(artistId: string, alias: string): Promise<LinkResult> {
  return withTenantFromHeaders(async () => {
    try {
      const { linked } = await addArtistAlias(artistId, alias);
      revalidateArtist(artistId);
      return { success: true, linked };
    } catch (err) {
      if (err instanceof AliasRefused) return { success: false, error: err.message };
      console.error("[addArtistAliasAction]", err);
      return { success: false, error: "Could not add the alias" };
    }
  });
}

export async function removeArtistAliasAction(artistId: string, aliasId: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await removeArtistAlias(aliasId);
      revalidateArtist(artistId);
      return { success: true };
    } catch (err) {
      console.error("[removeArtistAliasAction]", err);
      return { success: false, error: "Could not remove the alias" };
    }
  });
}

/** Link credits you picked; without ids, every exact and unambiguous one */
export async function linkArtistCreditsAction(artistId: string, creditIds?: string[]): Promise<LinkResult> {
  return withTenantFromHeaders(async () => {
    try {
      const linked = creditIds ? await linkCreditsToArtist(artistId, creditIds) : await linkExactCredits(artistId);
      revalidateArtist(artistId);
      return { success: true, linked };
    } catch (err) {
      console.error("[linkArtistCreditsAction]", err);
      return { success: false, error: "Could not link the credits" };
    }
  });
}
