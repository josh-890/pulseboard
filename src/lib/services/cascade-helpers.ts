import { prisma } from "@/lib/db";
import type { PhotoVariants } from "@/lib/types";

/**
 * Transaction client type — same shape as prisma but scoped to a transaction.
 * Used by cascade helper functions that run inside $transaction callbacks.
 */
export type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Cascade soft-delete a set: session links, credits, participants, evidence, then the set itself.
 */
export async function cascadeDeleteSet(
  tx: TxClient,
  setId: string,
  deletedAt: Date,
) {
  // Hard-delete SetSession rows (no deletedAt column)
  await tx.setSession.deleteMany({
    where: { setId },
  });

  // Soft-delete SetCreditRaw records
  await tx.setCreditRaw.updateMany({
    where: { setId, deletedAt: null },
    data: { deletedAt },
  });

  // Hard-delete SetParticipant records (no deletedAt column)
  await tx.setParticipant.deleteMany({
    where: { setId },
  });

  // Hard-delete SetLabelEvidence records (no deletedAt column)
  await tx.setLabelEvidence.deleteMany({
    where: { setId },
  });

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
 * Hard-delete media items and all referencing join table rows.
 * Returns the variants JSON from each deleted item so the caller can
 * clean up MinIO files after the transaction commits.
 */
export async function cascadeHardDeleteMediaItems(
  tx: TxClient,
  mediaItemIds: string[],
): Promise<PhotoVariants[]> {
  if (mediaItemIds.length === 0) return [];

  // 1. NULL out coverMediaItemId on any sets referencing these items
  await tx.set.updateMany({
    where: { coverMediaItemId: { in: mediaItemIds } },
    data: { coverMediaItemId: null },
  });

  // 2. Hard-delete SetMediaItem (no deletedAt)
  await tx.setMediaItem.deleteMany({
    where: { mediaItemId: { in: mediaItemIds } },
  });

  // 3. Hard-delete MediaCollectionItem (no deletedAt)
  await tx.mediaCollectionItem.deleteMany({
    where: { mediaItemId: { in: mediaItemIds } },
  });

  // 3b. Hard-delete SkillEventMedia (no deletedAt)
  await tx.skillEventMedia.deleteMany({
    where: { mediaItemId: { in: mediaItemIds } },
  });

  // 4. Hard-delete PersonMediaLink
  await tx.personMediaLink.deleteMany({
    where: { mediaItemId: { in: mediaItemIds } },
  });

  // 5. Fetch variants JSON for MinIO cleanup before deleting
  const toDelete = await tx.mediaItem.findMany({
    where: { id: { in: mediaItemIds } },
    select: { variants: true },
  });
  const variantsList = toDelete
    .map((m) => m.variants as unknown as PhotoVariants)
    .filter(Boolean);

  // 6. Hard-delete the media items themselves
  await tx.mediaItem.deleteMany({
    where: { id: { in: mediaItemIds } },
  });

  return variantsList;
}

/**
 * Cascade soft-delete person skills: events by personSkillId chain (not personaId — events may have null persona),
 * then skills, and hard-delete session participant skills.
 */
export async function cascadeDeletePersonSkills(
  tx: TxClient,
  personId: string,
  _personaIds: string[],
  deletedAt: Date,
) {
  // Get all person skill IDs first
  const skills = await tx.personSkill.findMany({
    where: { personId, deletedAt: null },
    select: { id: true },
  });
  const skillIds = skills.map((s) => s.id);

  if (skillIds.length > 0) {
    // Get event IDs to clean up media
    const events = await tx.personSkillEvent.findMany({
      where: { personSkillId: { in: skillIds }, deletedAt: null },
      select: { id: true },
    });
    const eventIds = events.map((e) => e.id);
    if (eventIds.length > 0) {
      await tx.skillEventMedia.deleteMany({
        where: { skillEventId: { in: eventIds } },
      });
    }
    await tx.personSkillEvent.updateMany({
      where: { personSkillId: { in: skillIds }, deletedAt: null },
      data: { deletedAt },
    });
  }

  // Soft-delete skills
  await tx.personSkill.updateMany({
    where: { personId, deletedAt: null },
    data: { deletedAt },
  });
  // Hard-delete session participant skills (no deletedAt column)
  await tx.sessionParticipantSkill.deleteMany({
    where: { personId },
  });
}

/**
 * Cascade soft-delete a session: SetSession links, participants, media items, then the session itself.
 */
export async function cascadeDeleteSession(
  tx: TxClient,
  sessionId: string,
  deletedAt: Date,
) {
  // Hard-delete SetSession rows (no deletedAt column)
  await tx.setSession.deleteMany({
    where: { sessionId },
  });

  // Hard-delete session participants (no deletedAt column)
  await tx.sessionParticipant.deleteMany({
    where: { sessionId },
  });

  // Hard-delete session participant skills (no deletedAt column)
  await tx.sessionParticipantSkill.deleteMany({
    where: { sessionId },
  });

  // Soft-delete media items belonging to this session
  await tx.mediaItem.updateMany({
    where: { sessionId, deletedAt: null },
    data: { deletedAt },
  });

  await tx.session.update({
    where: { id: sessionId },
    data: { deletedAt },
  });
}
