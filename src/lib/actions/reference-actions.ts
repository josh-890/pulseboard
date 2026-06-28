"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { createPersonSchema } from "@/lib/validations/person";
import { createPersonRecord } from "@/lib/services/person-service";
import { linkReferenceToPerson, setReferenceIgnored } from "@/lib/services/relationship-service";
import type { CrudActionResult, SimpleActionResult } from "@/lib/types";

function revalidateReferences() {
  revalidatePath("/people/references");
  revalidatePath("/people");
}

// Promote a Reference (ghost) to a full Person. Only valid when the ref carries
// a (well-formed) ICG-ID — name-only refs must be linked to an existing Person
// instead. Creating the Person auto-reconciles: the ref's edges repoint and the
// ref is deleted (see createPersonRecord → reconcilePersonRefs).
export async function addPersonFromReferenceAction(refId: string): Promise<CrudActionResult> {
  return withTenantFromHeaders(async () => {
    const ref = await prisma.personRef.findUnique({ where: { id: refId } });
    if (!ref) return { success: false, error: "Reference not found" };
    if (!ref.icgId) {
      return {
        success: false,
        error: { fieldErrors: { icgId: ["This reference has no ICG-ID — link it to an existing person instead."] } },
      };
    }
    const parsed = createPersonSchema.safeParse({ icgId: ref.icgId, commonName: ref.name });
    if (!parsed.success) return { success: false, error: parsed.error.flatten() };
    try {
      const person = await createPersonRecord(parsed.data);
      revalidateReferences();
      return { success: true, id: person.id };
    } catch (err) {
      if (err instanceof Error && err.message.includes("P2002")) {
        return { success: false, error: { fieldErrors: { icgId: ["ICG-ID already exists"] } } };
      }
      return { success: false, error: "Unexpected error" };
    }
  });
}

// Attach a Reference to an existing Person (manual reconcile): repoint the ref's
// claims/relationships and delete it.
export async function linkReferenceAction(refId: string, personId: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const res = await prisma.$transaction((tx) => linkReferenceToPerson(tx, refId, personId));
      if (!res.reconciled) return { success: false, error: "Reference not found" };
      revalidateReferences();
      return { success: true };
    } catch {
      return { success: false, error: "Unexpected error" };
    }
  });
}

export async function ignoreReferenceAction(refId: string, ignored: boolean): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await setReferenceIgnored(refId, ignored);
      revalidateReferences();
      return { success: true };
    } catch {
      return { success: false, error: "Unexpected error" };
    }
  });
}
