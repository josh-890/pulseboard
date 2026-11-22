"use server";

import { revalidatePath } from "next/cache";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import {
  clearComposerDrawing,
  createComposerCombination,
  createComposerValue,
  reorderComposer,
  setComposerConfusables,
  setComposerDrawing,
  setComposerValueParents,
  updateComposerFacet,
  updateComposerPath,
  updateComposerSection,
  updateComposerValue,
  type FacetPatch,
  type ReorderKind,
} from "@/lib/services/composer-manage-service";
import { setRelevance, type RelevanceTargetKind } from "@/lib/services/composer-relevance-service";
import type { RelevanceLevel } from "@/lib/composer";
import type { SimpleActionResult } from "@/lib/types";

// Settings → Composer writes (ADR-0043, R4). No type exports from a "use server"
// file — result shapes are written inline.

function revalidateComposer() {
  revalidatePath("/settings/catalogs/composer");
  revalidatePath("/sets", "layout");
  revalidatePath("/sessions", "layout");
}

async function run(label: string, fn: () => Promise<unknown>): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await fn();
      revalidateComposer();
      return { success: true };
    } catch (err) {
      console.error(`[composer-manage] ${label}`, err);
      return { success: false, error: err instanceof Error ? err.message : `Could not ${label}` };
    }
  });
}

type CreatedTag = { id: string; name: string; description: string | null; groupId: string; parentIds: string[]; drawingUrl?: string | null; region?: boolean };

async function create(label: string, fn: () => Promise<CreatedTag>): Promise<{ success: true; tag: CreatedTag } | { success: false; error: string }> {
  return withTenantFromHeaders(async () => {
    try {
      const tag = await fn();
      revalidateComposer();
      return { success: true as const, tag };
    } catch (err) {
      console.error(`[composer-manage] ${label}`, err);
      return { success: false as const, error: err instanceof Error ? err.message : `Could not ${label}` };
    }
  });
}

export async function updateComposerPathAction(
  id: string,
  data: { name?: string; tileAspect?: string; pinned?: boolean; personal?: boolean },
): Promise<SimpleActionResult> {
  return run("save the path", () => updateComposerPath(id, data));
}

export async function updateComposerSectionAction(id: string, data: { name?: string; passable?: boolean }): Promise<SimpleActionResult> {
  return run("save the section", () => updateComposerSection(id, data));
}

export async function updateComposerFacetAction(groupId: string, data: FacetPatch): Promise<SimpleActionResult> {
  return run("save the facet", () => updateComposerFacet(groupId, data));
}

export async function reorderComposerAction(kind: ReorderKind, parentId: string | null, orderedIds: string[]): Promise<SimpleActionResult> {
  return run("reorder", () => reorderComposer(kind, parentId, orderedIds));
}

export async function updateComposerValueAction(
  tagId: string,
  data: { name?: string; description?: string | null; regionCatalogId?: string | null },
): Promise<SimpleActionResult> {
  return run("save the value", () => updateComposerValue(tagId, data));
}

export async function createComposerValueAction(groupId: string, name: string, description?: string | null) {
  return create("add the value", () => createComposerValue(groupId, name, description));
}

export async function createComposerCombinationAction(groupId: string, name: string, partIds: string[]) {
  return create("create the named form", () => createComposerCombination(groupId, name, partIds));
}

export async function setComposerValueParentsAction(tagId: string, parentIds: string[]): Promise<SimpleActionResult> {
  return run("save the parents", () => setComposerValueParents(tagId, parentIds));
}

export async function setComposerConfusablesAction(tagId: string, otherIds: string[]): Promise<SimpleActionResult> {
  return run("save the look-alikes", () => setComposerConfusables(tagId, otherIds));
}

export async function setComposerRelevanceAction(
  contextTagId: string,
  targetKind: RelevanceTargetKind,
  targetId: string,
  level: RelevanceLevel | null,
): Promise<SimpleActionResult> {
  return run("save the cell", () => setRelevance(contextTagId, targetKind, targetId, level));
}

export async function setComposerDrawingAction(tagId: string, form: FormData): Promise<SimpleActionResult> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { success: false, error: "No drawing chosen" };
  if (file.size > 5 * 1024 * 1024) return { success: false, error: "The drawing is larger than 5 MB" };
  const buffer = Buffer.from(await file.arrayBuffer());
  return run("read this drawing", () => setComposerDrawing(tagId, buffer));
}

export async function clearComposerDrawingAction(tagId: string): Promise<SimpleActionResult> {
  return run("remove the drawing", () => clearComposerDrawing(tagId));
}
