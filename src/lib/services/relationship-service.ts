import { prisma } from "@/lib/db";
import type { TxClient } from "./cascade-helpers";

// ── Held work co-occurrence ─────────────────────────────────────────────────
// Computed (not stored): people who actually share a promoted Set with the
// subject, ranked by shared-set count. Staged co-occurrence (via
// StagingSet.participantIcgIds, which may resolve to PersonRefs) is layered in
// with the Connections tab in a later slice.

export type PersonCoOccurrence = {
  personId: string;
  commonAlias: string | null;
  icgId: string;
  sharedSetCount: number;
};

export async function getPersonCoOccurrence(personId: string): Promise<PersonCoOccurrence[]> {
  const mine = await prisma.setParticipant.findMany({
    where: { personId },
    select: { setId: true },
  });
  const setIds = [...new Set(mine.map((m) => m.setId))];
  if (setIds.length === 0) return [];

  const others = await prisma.setParticipant.findMany({
    where: { setId: { in: setIds }, personId: { not: personId } },
    select: {
      setId: true,
      person: {
        select: {
          id: true,
          icgId: true,
          aliases: { where: { isCommon: true }, take: 1, select: { name: true } },
        },
      },
    },
  });

  const byPerson = new Map<
    string,
    { id: string; icgId: string; commonAlias: string | null; sets: Set<string> }
  >();
  for (const o of others) {
    let entry = byPerson.get(o.person.id);
    if (!entry) {
      entry = {
        id: o.person.id,
        icgId: o.person.icgId,
        commonAlias: o.person.aliases[0]?.name ?? null,
        sets: new Set(),
      };
      byPerson.set(o.person.id, entry);
    }
    entry.sets.add(o.setId);
  }

  return [...byPerson.values()]
    .map((e) => ({
      personId: e.id,
      icgId: e.icgId,
      commonAlias: e.commonAlias,
      sharedSetCount: e.sets.size,
    }))
    .sort((a, b) => b.sharedSetCount - a.sharedSetCount);
}

// ── References register ──────────────────────────────────────────────────────

export type PersonReferenceRow = {
  id: string;
  icgId: string | null;
  name: string;
  thumbUrl: string | null;
  note: string | null;
  ignoredAt: Date | null;
  claimCount: number;
  relationshipCount: number;
  referenceCount: number;
  subjects: string[]; // sample of subjects who reference this person
};

export type ReferenceSort = "count" | "name" | "recent";

export async function getPersonReferences(opts: {
  q?: string;
  includeIgnored?: boolean;
  sort?: ReferenceSort;
} = {}): Promise<PersonReferenceRow[]> {
  const q = opts.q?.trim();
  const refs = await prisma.personRef.findMany({
    where: {
      ...(opts.includeIgnored ? {} : { ignoredAt: null }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { icgId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      _count: { select: { claims: true, relationshipsTo: true } },
      claims: {
        take: 3,
        include: {
          subjectPerson: {
            select: { aliases: { where: { isCommon: true }, take: 1, select: { name: true } } },
          },
        },
      },
    },
  });

  const rows: PersonReferenceRow[] = refs.map((r) => ({
    id: r.id,
    icgId: r.icgId,
    name: r.name,
    thumbUrl: r.thumbUrl,
    note: r.note,
    ignoredAt: r.ignoredAt,
    claimCount: r._count.claims,
    relationshipCount: r._count.relationshipsTo,
    referenceCount: r._count.claims + r._count.relationshipsTo,
    subjects: r.claims
      .map((c) => c.subjectPerson.aliases[0]?.name)
      .filter((n): n is string => !!n),
  }));

  const sort = opts.sort ?? "count";
  rows.sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "count") return b.referenceCount - a.referenceCount || a.name.localeCompare(b.name);
    return 0; // "recent" handled by query order below
  });
  return rows;
}

export async function countActivePersonReferences(): Promise<number> {
  return prisma.personRef.count({ where: { ignoredAt: null } });
}

export async function setReferenceIgnored(refId: string, ignored: boolean): Promise<void> {
  await prisma.personRef.update({
    where: { id: refId },
    data: { ignoredAt: ignored ? new Date() : null },
  });
}

// ── Reconciliation ──────────────────────────────────────────────────────────
// When a Person gains an ICG-ID matching a PersonRef (import or manual add), the
// ref's edges repoint to the Person and the ref is retired. Deterministic —
// keyed by the canonical ICG-ID, never fuzzy. Must run inside a transaction.

export type ReconcileResult = { reconciled: boolean; refId?: string };

// Retire a PersonRef by ICG-ID: when a curated Person appears with the ref's
// ICG-ID, repoint its edges and delete it. Exact-match only.
export async function reconcilePersonRefs(
  tx: TxClient,
  icgId: string,
  personId: string,
): Promise<ReconcileResult> {
  if (!icgId) return { reconciled: false };
  const ref = await tx.personRef.findUnique({ where: { icgId } });
  if (!ref) return { reconciled: false };
  await repointRefToPerson(tx, ref.id, personId);
  return { reconciled: true, refId: ref.id };
}

// Manual variant: link a specific ref (e.g. a name-only one, or a mismatch) to
// a user-chosen Person, repointing its edges and deleting it.
export async function linkReferenceToPerson(
  tx: TxClient,
  refId: string,
  personId: string,
): Promise<ReconcileResult> {
  const ref = await tx.personRef.findUnique({ where: { id: refId } });
  if (!ref) return { reconciled: false };
  await repointRefToPerson(tx, ref.id, personId);
  return { reconciled: true, refId: ref.id };
}

async function repointRefToPerson(tx: TxClient, refId: string, personId: string): Promise<void> {
  // Repoint claimed collaborations (subject ↔ ref) → (subject ↔ person),
  // dropping self-claims and merging into any pre-existing person-keyed claim.
  const claims = await tx.claimedCollaboration.findMany({ where: { counterpartRefId: refId } });
  for (const c of claims) {
    if (c.subjectPersonId === personId) {
      await tx.claimedCollaboration.delete({ where: { id: c.id } });
      continue;
    }
    const existing = await tx.claimedCollaboration.findUnique({
      where: {
        subjectPersonId_counterpartPersonId: {
          subjectPersonId: c.subjectPersonId,
          counterpartPersonId: personId,
        },
      },
    });
    if (existing) {
      await tx.claimedCollaboration.delete({ where: { id: c.id } });
    } else {
      await tx.claimedCollaboration.update({
        where: { id: c.id },
        data: { counterpartRefId: null, counterpartPersonId: personId },
      });
    }
  }

  // Repoint manual relationships (from ↔ ref) → (from ↔ person), same rules.
  const rels = await tx.personRelationship.findMany({ where: { toRefId: refId } });
  for (const rel of rels) {
    if (rel.personId === personId) {
      await tx.personRelationship.delete({ where: { id: rel.id } });
      continue;
    }
    const existing = await tx.personRelationship.findUnique({
      where: {
        personId_toPersonId_roleId: {
          personId: rel.personId,
          toPersonId: personId,
          roleId: rel.roleId,
        },
      },
    });
    if (existing) {
      await tx.personRelationship.delete({ where: { id: rel.id } });
    } else {
      await tx.personRelationship.update({
        where: { id: rel.id },
        data: { toRefId: null, toPersonId: personId },
      });
    }
  }

  // No edges reference the ref any more — retire it.
  await tx.personRef.delete({ where: { id: refId } });
}
