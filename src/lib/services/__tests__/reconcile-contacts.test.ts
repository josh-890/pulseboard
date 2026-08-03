import { describe, expect, it, vi } from "vitest";
import { reconcileContacts } from "@/lib/services/relationship-service";
import type { TxClient } from "@/lib/services/cascade-helpers";

// Build a mock transaction client that records the calls reconcile makes. Only
// the methods reconcileContacts touches are implemented.
function makeTx(opts: {
  ref: { id: string } | null;
  claims?: { id: string; subjectPersonId: string }[];
  rels?: { id: string; personId: string; roleId: string }[];
  existingClaim?: boolean;
  existingRel?: boolean;
}) {
  const calls = {
    claimUpdate: vi.fn(),
    claimDelete: vi.fn(),
    relUpdate: vi.fn(),
    relDelete: vi.fn(),
    refDelete: vi.fn(),
    creditUpdateMany: vi.fn(),
    attributionUpdateMany: vi.fn(),
  };
  const tx = {
    contact: {
      findUnique: vi.fn().mockResolvedValue(opts.ref),
      delete: calls.refDelete,
    },
    claimedCollaboration: {
      findMany: vi.fn().mockResolvedValue(opts.claims ?? []),
      findUnique: vi.fn().mockResolvedValue(opts.existingClaim ? { id: "existing" } : null),
      update: calls.claimUpdate,
      delete: calls.claimDelete,
    },
    personRelationship: {
      findMany: vi.fn().mockResolvedValue(opts.rels ?? []),
      findUnique: vi.fn().mockResolvedValue(opts.existingRel ? { id: "existing" } : null),
      update: calls.relUpdate,
      delete: calls.relDelete,
    },
    // Plan slice 2: credits pinned to the contact are repointed onto the person
    // before the contact row is retired.
    setCreditRaw: {
      updateMany: calls.creditUpdateMany,
    },
    // Plan slice 5: archive attributions pinned to the contact move to the person
    // for the same reason, and with the same onDelete: SetNull trap.
    archiveFolderAttribution: {
      updateMany: calls.attributionUpdateMany,
    },
  } as unknown as TxClient;
  return { tx, calls };
}

describe("reconcileContacts", () => {
  it("is a no-op when no ref matches the ICG-ID", async () => {
    const { tx, calls } = makeTx({ ref: null });
    const res = await reconcileContacts(tx, "ICG-1", "person-1");
    expect(res.reconciled).toBe(false);
    expect(calls.refDelete).not.toHaveBeenCalled();
  });

  it("repoints a claim to the person and retires the ref", async () => {
    const { tx, calls } = makeTx({
      ref: { id: "ref-1" },
      claims: [{ id: "claim-1", subjectPersonId: "subject-1" }],
    });
    const res = await reconcileContacts(tx, "ICG-1", "person-1");
    expect(res).toEqual({ reconciled: true, refId: "ref-1" });
    expect(calls.claimUpdate).toHaveBeenCalledWith({
      where: { id: "claim-1" },
      data: { counterpartRefId: null, counterpartPersonId: "person-1" },
    });
    expect(calls.claimDelete).not.toHaveBeenCalled();
    expect(calls.refDelete).toHaveBeenCalledWith({ where: { id: "ref-1" } });
  });

  it("deletes the ref-claim instead of repointing when a person-keyed claim already exists", async () => {
    const { tx, calls } = makeTx({
      ref: { id: "ref-1" },
      claims: [{ id: "claim-1", subjectPersonId: "subject-1" }],
      existingClaim: true,
    });
    await reconcileContacts(tx, "ICG-1", "person-1");
    expect(calls.claimDelete).toHaveBeenCalledWith({ where: { id: "claim-1" } });
    expect(calls.claimUpdate).not.toHaveBeenCalled();
  });

  it("drops a self-claim (subject resolves to the same person)", async () => {
    const { tx, calls } = makeTx({
      ref: { id: "ref-1" },
      claims: [{ id: "claim-1", subjectPersonId: "person-1" }],
    });
    await reconcileContacts(tx, "ICG-1", "person-1");
    expect(calls.claimDelete).toHaveBeenCalledWith({ where: { id: "claim-1" } });
    expect(calls.claimUpdate).not.toHaveBeenCalled();
  });

  it("repoints contact-pinned set credits onto the person before retiring the ref", async () => {
    const { tx, calls } = makeTx({ ref: { id: "ref-1" } });
    await reconcileContacts(tx, "ICG-1", "person-1");

    expect(calls.creditUpdateMany).toHaveBeenCalledWith({
      where: { resolvedContactId: "ref-1" },
      data: { resolvedContactId: null, resolvedPersonId: "person-1", resolutionStatus: "RESOLVED" },
    });
    // Ordering matters: the FK is onDelete SetNull, so repointing after the
    // delete would silently strip the key instead of moving it.
    expect(calls.creditUpdateMany.mock.invocationCallOrder[0])
      .toBeLessThan(calls.refDelete.mock.invocationCallOrder[0]);
  });

  it("repoints archive attributions onto the person before retiring the ref", async () => {
    const { tx, calls } = makeTx({ ref: { id: "ref-1" } });
    await reconcileContacts(tx, "ICG-1", "person-1");

    expect(calls.attributionUpdateMany).toHaveBeenCalledWith({
      where: { contactId: "ref-1" },
      data: { contactId: null, personId: "person-1" },
    });
    // Same trap as the credits above: onDelete SetNull means repointing after the
    // delete would not fail, it would quietly leave the attribution pointing at
    // nobody while its ICG-ID still says who it is.
    expect(calls.attributionUpdateMany.mock.invocationCallOrder[0])
      .toBeLessThan(calls.refDelete.mock.invocationCallOrder[0]);
  });

  it("repoints a manual relationship's ref endpoint to the person", async () => {
    const { tx, calls } = makeTx({
      ref: { id: "ref-1" },
      rels: [{ id: "rel-1", personId: "subject-1", roleId: "role-1" }],
    });
    await reconcileContacts(tx, "ICG-1", "person-1");
    expect(calls.relUpdate).toHaveBeenCalledWith({
      where: { id: "rel-1" },
      data: { toRefId: null, toPersonId: "person-1" },
    });
    expect(calls.refDelete).toHaveBeenCalledWith({ where: { id: "ref-1" } });
  });
});
