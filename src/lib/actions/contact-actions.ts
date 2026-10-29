"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { createPersonSchema } from "@/lib/validations/person";
import { createPersonRecord } from "@/lib/services/person-service";
import { linkContactToPerson, setContactIgnored, getContactsPage } from "@/lib/services/relationship-service";
import {
  adoptPortraitAsHeadshot,
  clearContactPortrait,
  identifyCast,
  type CastIdentity,
  renameContact,
  setContactNote,
  setContactPortrait,
} from "@/lib/services/contact-service";
import { developContact, DevelopRefused, reviewNewerFile } from "@/lib/services/catalogue-develop-service";
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
      // A portrait you chose becomes her headshot (ADR-0038); the Contact is gone now
      if (ref.portraitKey) {
        await adoptPortraitAsHeadshot(person.id, ref.portraitKey).catch((err) =>
          console.error("addPersonFromContactAction: portrait not carried over", err),
        );
      }
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

// ── The Contact page (ADR-0038, S2) ─────────────────────────────────────────

function revalidateContact(id: string) {
  revalidatePath(`/people/contacts/${id}`);
  revalidatePath("/people/contacts");
}

/** Rename (sticks), or `null` to go back to the name in her catalogue file */
export async function renameContactAction(contactId: string, name: string | null): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await renameContact(contactId, name);
      revalidateContact(contactId);
      return { success: true };
    } catch (err) {
      console.error("[renameContactAction]", err);
      return { success: false, error: err instanceof Error ? err.message : "Could not rename" };
    }
  });
}

export async function setContactNoteAction(contactId: string, note: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await setContactNote(contactId, note);
      revalidateContact(contactId);
      return { success: true };
    } catch (err) {
      console.error("[setContactNoteAction]", err);
      return { success: false, error: "Could not save the note" };
    }
  });
}

/** A portrait the user chose — sticks over the catalogue portrait */
export async function setContactPortraitAction(contactId: string, form: FormData): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { success: false, error: "No image chosen" };
    try {
      await setContactPortrait(contactId, Buffer.from(await file.arrayBuffer()));
      revalidateContact(contactId);
      return { success: true };
    } catch (err) {
      console.error("[setContactPortraitAction]", err);
      const reason = err instanceof Error ? err.message : "unknown error";
      return { success: false, error: `This image could not be read: ${reason}` };
    }
  });
}

export async function clearContactPortraitAction(contactId: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await clearContactPortrait(contactId);
      revalidateContact(contactId);
      return { success: true };
    } catch (err) {
      console.error("[clearContactPortraitAction]", err);
      return { success: false, error: "Could not reset the portrait" };
    }
  });
}

/** Who each ICG-ID of a cast is: Person, Contact or unknown */
export async function identifyCastAction(icgIds: string[]): Promise<Record<string, CastIdentity>> {
  return withTenantFromHeaders(() => identifyCast(icgIds.slice(0, 200)));
}

// ── Develop and the newer-file hint (ADR-0038 S6) ───────────────────────────

type BatchResult = { success: true; batchId: string } | { success: false; error: string };

/** Develop a Contact: the full import from her stored catalogue file — the review follows */
export async function developContactAction(contactId: string): Promise<BatchResult> {
  return withTenantFromHeaders(async () => {
    try {
      const { batchId } = await developContact(contactId);
      revalidatePath("/import");
      return { success: true, batchId };
    } catch (err) {
      if (err instanceof DevelopRefused) return { success: false, error: err.message };
      console.error("[developContactAction]", err);
      return { success: false, error: "Could not read her catalogue file" };
    }
  });
}

/** Review a Person's newer catalogue file (ADR-0009 review) */
export async function reviewNewerFileAction(personId: string): Promise<BatchResult> {
  return withTenantFromHeaders(async () => {
    try {
      const { batchId } = await reviewNewerFile(personId);
      revalidatePath(`/people/${personId}`);
      revalidatePath("/people/contacts/runs");
      return { success: true, batchId };
    } catch (err) {
      if (err instanceof DevelopRefused) return { success: false, error: err.message };
      console.error("[reviewNewerFileAction]", err);
      return { success: false, error: "Could not read her catalogue file" };
    }
  });
}
