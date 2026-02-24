import { prisma } from "@/lib/db";
import type { EntityType } from "@/generated/prisma/client";

/**
 * Transaction client type — same shape as prisma but scoped to a transaction.
 * Used by cascade helper functions that run inside $transaction callbacks.
 */
export type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Soft-delete all photos for a given entity (polymorphic photo pattern).
 */
export async function cascadeDeletePhotos(
  tx: TxClient,
  entityType: EntityType,
  entityId: string,
  deletedAt: Date,
) {
  await tx.photo.updateMany({
    where: { entityType, entityId, deletedAt: null },
    data: { deletedAt },
  });
}

/**
 * Cascade soft-delete a set: contributions + photos, then the set itself.
 */
export async function cascadeDeleteSet(
  tx: TxClient,
  setId: string,
  deletedAt: Date,
) {
  await tx.setContribution.updateMany({
    where: { setId, deletedAt: null },
    data: { deletedAt },
  });

  await cascadeDeletePhotos(tx, "set", setId, deletedAt);

  await tx.set.update({
    where: { id: setId },
    data: { deletedAt },
  });
}

/**
 * Cascade soft-delete body modifications for a person: events, then modifications.
 */
export async function cascadeDeleteBodyModifications(
  tx: TxClient,
  personId: string,
  personaIds: string[],
  deletedAt: Date,
) {
  if (personaIds.length > 0) {
    await tx.bodyModificationEvent.updateMany({
      where: { personaId: { in: personaIds }, deletedAt: null },
      data: { deletedAt },
    });
  }
  await tx.bodyModification.updateMany({
    where: { personId, deletedAt: null },
    data: { deletedAt },
  });
}

/**
 * Cascade soft-delete cosmetic procedures for a person: events, then procedures.
 */
export async function cascadeDeleteCosmeticProcedures(
  tx: TxClient,
  personId: string,
  personaIds: string[],
  deletedAt: Date,
) {
  if (personaIds.length > 0) {
    await tx.cosmeticProcedureEvent.updateMany({
      where: { personaId: { in: personaIds }, deletedAt: null },
      data: { deletedAt },
    });
  }
  await tx.cosmeticProcedure.updateMany({
    where: { personId, deletedAt: null },
    data: { deletedAt },
  });
}

/**
 * Cascade soft-delete education, awards, interests for a person.
 */
export async function cascadeDeletePersonExtras(
  tx: TxClient,
  personId: string,
  deletedAt: Date,
) {
  await tx.personEducation.updateMany({
    where: { personId, deletedAt: null },
    data: { deletedAt },
  });
  await tx.personAward.updateMany({
    where: { personId, deletedAt: null },
    data: { deletedAt },
  });
  await tx.personInterest.updateMany({
    where: { personId, deletedAt: null },
    data: { deletedAt },
  });
}

/**
 * Cascade soft-delete relationship events for relationships involving a person.
 */
export async function cascadeDeleteRelationshipEvents(
  tx: TxClient,
  personId: string,
  deletedAt: Date,
) {
  const relationships = await tx.personRelationship.findMany({
    where: {
      OR: [{ personAId: personId }, { personBId: personId }],
      deletedAt: null,
    },
    select: { id: true },
  });
  const relationshipIds = relationships.map((r) => r.id);
  if (relationshipIds.length > 0) {
    await tx.relationshipEvent.updateMany({
      where: { relationshipId: { in: relationshipIds }, deletedAt: null },
      data: { deletedAt },
    });
  }
}

/**
 * Cascade soft-delete a session: all its non-deleted sets, then the session itself.
 */
export async function cascadeDeleteSession(
  tx: TxClient,
  sessionId: string,
  deletedAt: Date,
) {
  const sets = await tx.set.findMany({
    where: { sessionId, deletedAt: null },
    select: { id: true },
  });

  for (const set of sets) {
    await cascadeDeleteSet(tx, set.id, deletedAt);
  }

  await tx.session.update({
    where: { id: sessionId },
    data: { deletedAt },
  });
}
