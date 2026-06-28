import { prisma } from "@/lib/db";
import { normalizeForSearch } from "@/lib/normalize";
import type { RelationshipType } from "@/generated/prisma/client";
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

// ── Connections tab data ─────────────────────────────────────────────────────

export type ConnectionCounterpart =
  | { kind: "person"; id: string; name: string; icgId: string | null }
  | { kind: "ref"; id: string; name: string; icgId: string | null };

export type PersonalRelationshipRow = {
  id: string;
  roleLabel: string; // role.name from this person's side, role.inverseName from the other
  category: RelationshipType;
  counterpart: ConnectionCounterpart;
  note: string | null;
};

export type ClaimedRow = {
  id: string;
  counterpart: ConnectionCounterpart;
  direction: "outgoing" | "incoming"; // this person claimed it / someone claimed it about them
};

export type ConnectionsData = {
  personal: PersonalRelationshipRow[];
  workHeld: PersonCoOccurrence[];
  claimed: ClaimedRow[];
};

type PersonLite = {
  id: string;
  icgId: string;
  aliases: { name: string }[];
};
function personCounterpart(p: PersonLite): ConnectionCounterpart {
  return { kind: "person", id: p.id, name: p.aliases[0]?.name ?? p.icgId, icgId: p.icgId };
}
function refCounterpart(r: { id: string; name: string; icgId: string | null }): ConnectionCounterpart {
  return { kind: "ref", id: r.id, name: r.name, icgId: r.icgId };
}

export async function getConnectionsForPerson(personId: string): Promise<ConnectionsData> {
  const personSelect = {
    id: true,
    icgId: true,
    aliases: { where: { isCommon: true }, take: 1, select: { name: true } },
  } as const;

  const [rels, claimsOut, claimsIn, workHeld] = await Promise.all([
    prisma.personRelationship.findMany({
      where: { OR: [{ personId }, { toPersonId: personId }] },
      include: {
        role: true,
        person: { select: personSelect },
        toPerson: { select: personSelect },
        toRef: { select: { id: true, name: true, icgId: true } },
      },
    }),
    prisma.claimedCollaboration.findMany({
      where: { subjectPersonId: personId },
      include: { counterpartPerson: { select: personSelect }, counterpartRef: { select: { id: true, name: true, icgId: true } } },
    }),
    prisma.claimedCollaboration.findMany({
      where: { counterpartPersonId: personId },
      include: { subjectPerson: { select: personSelect } },
    }),
    getPersonCoOccurrence(personId),
  ]);

  const personal: PersonalRelationshipRow[] = rels.map((r) => {
    const isFrom = r.personId === personId;
    const counterpart: ConnectionCounterpart = isFrom
      ? r.toPerson
        ? personCounterpart(r.toPerson)
        : refCounterpart(r.toRef!)
      : personCounterpart(r.person);
    return {
      id: r.id,
      roleLabel: isFrom ? r.role.name : r.role.inverseName,
      category: r.role.category,
      counterpart,
      note: r.label ?? r.context,
    };
  });

  const claimed: ClaimedRow[] = [
    ...claimsOut.map((c): ClaimedRow => ({
      id: c.id,
      direction: "outgoing",
      counterpart: c.counterpartPerson
        ? personCounterpart(c.counterpartPerson)
        : refCounterpart(c.counterpartRef!),
    })),
    ...claimsIn.map((c): ClaimedRow => ({
      id: c.id,
      direction: "incoming",
      counterpart: personCounterpart(c.subjectPerson),
    })),
  ];

  return { personal, workHeld, claimed };
}

export async function getRelationshipRoles() {
  return prisma.relationshipRole.findMany({ orderBy: { sortOrder: "asc" } });
}

// ── Relationship authoring ───────────────────────────────────────────────────

export type CreateRelationshipInput = {
  personId: string;
  roleId: string;
  /** Exactly one of these three identifies the counterpart. */
  counterpartPersonId?: string;
  counterpartRefId?: string;
  newRefName?: string; // create a name-only Contact (e.g. a non-industry contact)
  note?: string;
};

export async function createRelationship(input: CreateRelationshipInput): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const toPersonId = input.counterpartPersonId ?? null;
    let toRefId = input.counterpartRefId ?? null;

    if (!toPersonId && !toRefId && input.newRefName?.trim()) {
      const name = input.newRefName.trim();
      const ref = await tx.contact.create({
        data: { name, nameNorm: normalizeForSearch(name), source: "manual" },
      });
      toRefId = ref.id;
    }
    if (!toPersonId && !toRefId) throw new Error("No counterpart specified");
    if (toPersonId && toPersonId === input.personId) {
      throw new Error("A person cannot be related to themselves");
    }

    const rel = await tx.personRelationship.create({
      data: {
        personId: input.personId,
        toPersonId,
        toRefId,
        roleId: input.roleId,
        source: "manual",
        label: input.note?.trim() || null,
      },
    });
    return { id: rel.id };
  });
}

export async function deleteRelationship(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.relationshipEvent.deleteMany({ where: { relationshipId: id } });
    await tx.personRelationship.delete({ where: { id } });
  });
}

// ── Contacts register ────────────────────────────────────────────────────────

export type ContactRow = {
  id: string;
  icgId: string | null;
  name: string;
  thumbUrl: string | null;
  note: string | null;
  ignoredAt: Date | null;
  claimCount: number;
  relationshipCount: number;
  mentionCount: number;
  subjects: string[]; // sample of subjects who mention this person
};

export type ContactSort = "count" | "name" | "recent";

export async function getContacts(opts: {
  q?: string;
  includeIgnored?: boolean;
  sort?: ContactSort;
} = {}): Promise<ContactRow[]> {
  const q = opts.q?.trim();
  const refs = await prisma.contact.findMany({
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

  const rows: ContactRow[] = refs.map((r) => ({
    id: r.id,
    icgId: r.icgId,
    name: r.name,
    thumbUrl: r.thumbUrl,
    note: r.note,
    ignoredAt: r.ignoredAt,
    claimCount: r._count.claims,
    relationshipCount: r._count.relationshipsTo,
    mentionCount: r._count.claims + r._count.relationshipsTo,
    subjects: r.claims
      .map((c) => c.subjectPerson.aliases[0]?.name)
      .filter((n): n is string => !!n),
  }));

  const sort = opts.sort ?? "count";
  rows.sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "count") return b.mentionCount - a.mentionCount || a.name.localeCompare(b.name);
    return 0; // "recent" handled by query order below
  });
  return rows;
}

export async function countActiveContacts(): Promise<number> {
  return prisma.contact.count({ where: { ignoredAt: null } });
}

export async function setContactIgnored(refId: string, ignored: boolean): Promise<void> {
  await prisma.contact.update({
    where: { id: refId },
    data: { ignoredAt: ignored ? new Date() : null },
  });
}

// ── Reconciliation ──────────────────────────────────────────────────────────
// When a Person gains an ICG-ID matching a Contact (import or manual add), the
// ref's edges repoint to the Person and the ref is retired. Deterministic —
// keyed by the canonical ICG-ID, never fuzzy. Must run inside a transaction.

export type ReconcileResult = { reconciled: boolean; refId?: string };

// Retire a Contact by ICG-ID: when a curated Person appears with the ref's
// ICG-ID, repoint its edges and delete it. Exact-match only.
export async function reconcileContacts(
  tx: TxClient,
  icgId: string,
  personId: string,
): Promise<ReconcileResult> {
  if (!icgId) return { reconciled: false };
  const ref = await tx.contact.findUnique({ where: { icgId } });
  if (!ref) return { reconciled: false };
  await repointContactToPerson(tx, ref.id, personId);
  return { reconciled: true, refId: ref.id };
}

// Manual variant: link a specific ref (e.g. a name-only one, or a mismatch) to
// a user-chosen Person, repointing its edges and deleting it.
export async function linkContactToPerson(
  tx: TxClient,
  refId: string,
  personId: string,
): Promise<ReconcileResult> {
  const ref = await tx.contact.findUnique({ where: { id: refId } });
  if (!ref) return { reconciled: false };
  await repointContactToPerson(tx, ref.id, personId);
  return { reconciled: true, refId: ref.id };
}

async function repointContactToPerson(tx: TxClient, refId: string, personId: string): Promise<void> {
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
  await tx.contact.delete({ where: { id: refId } });
}
