"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { createPersonSchema } from "@/lib/validations/person";
import { createPersonRecord } from "@/lib/services/person-service";
import { linkContactToPerson, setContactIgnored, getContactsPage } from "@/lib/services/relationship-service";
import type { CrudActionResult, SimpleActionResult } from "@/lib/types";

// Infinite-scroll "load more" for the paginated tail of the Contacts register.
export async function loadMoreContactsAction(input: {
  q?: string;
  includeIgnored?: boolean;
  offset: number;
  excludeIds: string[];
}) {
  return withTenantFromHeaders(() =>
    getContactsPage({
      q: input.q,
      includeIgnored: input.includeIgnored,
      offset: input.offset,
      excludeIds: input.excludeIds,
    }),
  );
}

function revalidateContacts() {
  revalidatePath("/people/contacts");
  revalidatePath("/people");
}

// Promote a Contact (ghost) to a full Person. Only valid when the contact carries
// a (well-formed) ICG-ID — name-only contacts must be linked to an existing Person
// instead. Creating the Person auto-reconciles: the contact's edges repoint and it
// is deleted (see createPersonRecord → reconcileContacts).
export async function addPersonFromContactAction(refId: string): Promise<CrudActionResult> {
  return withTenantFromHeaders(async () => {
    const ref = await prisma.contact.findUnique({ where: { id: refId } });
    if (!ref) return { success: false, error: "Contact not found" };
    if (!ref.icgId) {
      return {
        success: false,
        error: { fieldErrors: { icgId: ["This contact has no ICG-ID — link it to an existing person instead."] } },
      };
    }
    // A contact's ICG-ID was harvested from an import, so it is external by
    // construction (ADR-0026) — validating it as such also rejects the
    // malformed/HTML-polluted values the parser can let through.
    const parsed = createPersonSchema.safeParse({
      icgId: ref.icgId,
      idOrigin: "external",
      commonName: ref.name,
    });
    if (!parsed.success) return { success: false, error: parsed.error.flatten() };
    try {
      const person = await createPersonRecord(parsed.data);
      revalidateContacts();
      return { success: true, id: person.id };
    } catch (err) {
      // Prisma surfaces the unique violation via the error CODE, not the message.
      if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
        return { success: false, error: { fieldErrors: { icgId: ["ICG-ID already exists"] } } };
      }
      console.error("addPersonFromContactAction failed", err);
      return { success: false, error: "Unexpected error" };
    }
  });
}

// Attach a Contact to an existing Person (manual reconcile): repoint the contact's
// claims/relationships and delete it.
export async function linkContactAction(refId: string, personId: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const res = await prisma.$transaction((tx) => linkContactToPerson(tx, refId, personId));
      if (!res.reconciled) return { success: false, error: "Contact not found" };
      revalidateContacts();
      return { success: true };
    } catch {
      return { success: false, error: "Unexpected error" };
    }
  });
}

export async function ignoreContactAction(refId: string, ignored: boolean): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await setContactIgnored(refId, ignored);
      revalidateContacts();
      return { success: true };
    } catch {
      return { success: false, error: "Unexpected error" };
    }
  });
}
