"use server";

import { revalidatePath } from "next/cache";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { addTagExample, getTagCard, removeTagExample, setTitleExample } from "@/lib/services/tag-example-service";

// Tag examples (ADR-0042, S4). No type exports from a "use server" file.

type Result = { success: true } | { success: false; error: string };

async function run(what: string, fn: () => Promise<void>): Promise<Result> {
  return withTenantFromHeaders(async () => {
    try {
      await fn();
      revalidatePath("/tags", "layout");
      return { success: true };
    } catch (err) {
      console.error(`[tag-example] ${what} failed`, err);
      return { success: false, error: err instanceof Error ? err.message : `Could not ${what}` };
    }
  });
}

export async function getTagCardAction(tagId: string) {
  return withTenantFromHeaders(() => getTagCard(tagId));
}

export async function addTagExampleAction(tagId: string, mediaItemId: string, crop: { x: number; y: number; w: number; h: number }) {
  return run("add the example", () => addTagExample(tagId, mediaItemId, crop));
}

export async function setTitleExampleAction(exampleId: string) {
  return run("make it the title", () => setTitleExample(exampleId));
}

export async function removeTagExampleAction(exampleId: string) {
  return run("remove the example", () => removeTagExample(exampleId));
}
