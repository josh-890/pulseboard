import { prisma } from "@/lib/db";
import type { PhotoVariants } from "@/lib/types";
import { parsePhotoVariants } from "@/lib/types";
import type { BodyMarkStatus, BodyModificationStatus } from "@/generated/prisma/client";

/**
 * Transaction client type — same shape as prisma but scoped to a transaction.
 * Used by cascade helper functions that run inside $transaction callbacks.
 */
export type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Cascade hard-delete a set: session links, credits, participants, evidence, then the set itself.
 */
export async function cascadeDeleteSet(
  tx: TxClient,
  setId: string,
) {
  await tx.setMediaItem.deleteMany({
    where: { setId },
  });

  await tx.setSession.deleteMany({
    where: { setId },
  });

  await tx.setCreditRaw.deleteMany({
    where: { setId },
  });

  await tx.setParticipant.deleteMany({
    where: { setId },
  });

  await tx.setLabelEvidence.deleteMany({
    where: { setId },
  });

  await tx.setTag.deleteMany({
    where: { setId },
  });

  // NULL out coverMediaItemId before deleting the set
  await tx.set.update({
    where: { id: setId },
    data: { coverMediaItemId: null },
  });

  await tx.set.delete({
    where: { id: setId },
  });
}

/**
 * Cascade hard-delete body modifications for a person: events, media links, then modifications.
 */
export async function cascadeDeleteBodyModifications(
  tx: TxClient,
  personId: string,
  eraIds: string[],
) {
  if (eraIds.length > 0) {
    await tx.bodyModificationEvent.deleteMany({
      where: { eraId: { in: eraIds } },
    });
  }
  // Clear PersonMediaLink refs before deleting modifications (no schema cascade)
  await tx.personMediaLink.deleteMany({
    where: { bodyModification: { personId } },
  });
  await tx.bodyModification.deleteMany({
    where: { personId },
  });
}

/**
 * Cascade hard-delete cosmetic procedures for a person: events, media links, then procedures.
 */
export async function cascadeDeleteCosmeticProcedures(
  tx: TxClient,
  personId: string,
  eraIds: string[],
) {
  if (eraIds.length > 0) {
    await tx.cosmeticProcedureEvent.deleteMany({
      where: { eraId: { in: eraIds } },
    });
  }
  // Clear PersonMediaLink refs before deleting procedures (no schema cascade)
  await tx.personMediaLink.deleteMany({
    where: { cosmeticProcedure: { personId } },
  });
  await tx.cosmeticProcedure.deleteMany({
    where: { personId },
  });
}

/**
 * Cascade hard-delete education, awards, interests for a person.
 */
export async function cascadeDeletePersonExtras(
  tx: TxClient,
  personId: string,
) {
  await tx.personEducation.deleteMany({
    where: { personId },
  });
  await tx.personAward.deleteMany({
    where: { personId },
  });
  await tx.personInterest.deleteMany({
    where: { personId },
  });
  await tx.personTag.deleteMany({
    where: { personId },
  });
}

/**
 * Cascade hard-delete relationship events for relationships involving a person.
 */
export async function cascadeDeleteRelationshipEvents(
  tx: TxClient,
  personId: string,
) {
  const relationships = await tx.personRelationship.findMany({
    where: {
      OR: [{ personAId: personId }, { personBId: personId }],
    },
    select: { id: true },
  });
  const relationshipIds = relationships.map((r) => r.id);
  if (relationshipIds.length > 0) {
    await tx.relationshipEvent.deleteMany({
      where: { relationshipId: { in: relationshipIds } },
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

  // 2. Hard-delete SetMediaItem
  await tx.setMediaItem.deleteMany({
    where: { mediaItemId: { in: mediaItemIds } },
  });

  // 3. Hard-delete MediaCollectionItem
  await tx.mediaCollectionItem.deleteMany({
    where: { mediaItemId: { in: mediaItemIds } },
  });

  // 3a-ii. Remove Comparison memberships (ComparisonItem.mediaItem FK is RESTRICT).
  // A comparison whose driver is deleted falls back to its first remaining member.
  await tx.comparison.updateMany({
    where: { aspectDriverMediaItemId: { in: mediaItemIds } },
    data: { aspectDriverMediaItemId: null },
  });
  await tx.comparisonItem.deleteMany({
    where: { mediaItemId: { in: mediaItemIds } },
  });

  // 3b. Hard-delete SkillEventMedia
  await tx.skillEventMedia.deleteMany({
    where: { mediaItemId: { in: mediaItemIds } },
  });

  // 4. Hard-delete PersonMediaLink
  await tx.personMediaLink.deleteMany({
    where: { mediaItemId: { in: mediaItemIds } },
  });

  // 4b. Hard-delete MediaItemTag
  await tx.mediaItemTag.deleteMany({
    where: { mediaItemId: { in: mediaItemIds } },
  });

  // 5. Fetch variants JSON for MinIO cleanup before deleting
  const toDelete = await tx.mediaItem.findMany({
    where: { id: { in: mediaItemIds } },
    select: { variants: true },
  });
  const variantsList = toDelete
    .map((m) => parsePhotoVariants(m.variants))
    .filter((v): v is PhotoVariants => v !== null);

  // 6. Hard-delete the media items themselves
  await tx.mediaItem.deleteMany({
    where: { id: { in: mediaItemIds } },
  });

  return variantsList;
}

/**
 * Cascade hard-delete person skills: events + media, then skills, and session participant skills.
 */
export async function cascadeDeletePersonSkills(
  tx: TxClient,
  personId: string,
) {
  // Get all person skill IDs first
  const skills = await tx.personSkill.findMany({
    where: { personId },
    select: { id: true },
  });
  const skillIds = skills.map((s) => s.id);

  if (skillIds.length > 0) {
    // Get event IDs to clean up media
    const events = await tx.personSkillEvent.findMany({
      where: { personSkillId: { in: skillIds } },
      select: { id: true },
    });
    const eventIds = events.map((e) => e.id);
    if (eventIds.length > 0) {
      await tx.skillEventMedia.deleteMany({
        where: { skillEventId: { in: eventIds } },
      });
    }
    await tx.personSkillEvent.deleteMany({
      where: { personSkillId: { in: skillIds } },
    });
  }

  // Hard-delete skills
  await tx.personSkill.deleteMany({
    where: { personId },
  });
  // Hard-delete contribution skills
  await tx.contributionSkill.deleteMany({
    where: { contribution: { personId } },
  });
}

/**
 * Cascade hard-delete aliases for a person: channel links, then aliases.
 */
export async function cascadeDeletePersonAliases(
  tx: TxClient,
  personId: string,
) {
  const aliases = await tx.personAlias.findMany({
    where: { personId },
    select: { id: true },
  });
  const aliasIds = aliases.map((a) => a.id);
  if (aliasIds.length > 0) {
    await tx.personAliasChannel.deleteMany({
      where: { aliasId: { in: aliasIds } },
    });
  }
  await tx.personAlias.deleteMany({
    where: { personId },
  });
}

/**
 * Cascade hard-delete a single era: physical + attributes, body mark events,
 * body modification events, cosmetic procedure events, digital identities,
 * skill event media + skill events, then the era itself.
 * NOTE: Does NOT clean up orphaned parent entities — that's handled by
 * cascadeDeletePersonEras or the caller should do it separately.
 */
export async function cascadeDeleteEra(
  tx: TxClient,
  eraId: string,
) {
  // ScalarDelta
  await tx.scalarDelta.deleteMany({ where: { eraId } });
  await tx.bodyMarkEvent.deleteMany({
    where: { eraId },
  });
  await tx.bodyModificationEvent.deleteMany({
    where: { eraId },
  });
  await tx.cosmeticProcedureEvent.deleteMany({
    where: { eraId },
  });
  await tx.digitalIdentityEvent.deleteMany({ where: { eraId } });
  await tx.interestEvent.deleteMany({ where: { eraId } });
  await tx.personDigitalIdentity.deleteMany({
    where: { eraId },
  });
  // Skill event media, then skill events
  const skillEvents = await tx.personSkillEvent.findMany({
    where: { eraId },
    select: { id: true },
  });
  if (skillEvents.length > 0) {
    await tx.skillEventMedia.deleteMany({
      where: { skillEventId: { in: skillEvents.map((e) => e.id) } },
    });
  }
  await tx.personSkillEvent.deleteMany({
    where: { eraId },
  });
  await tx.era.delete({
    where: { id: eraId },
  });
}

/**
 * Cascade hard-delete all eras for a person.
 */
export async function cascadeDeletePersonEras(
  tx: TxClient,
  personId: string,
) {
  const eras = await tx.era.findMany({
    where: { personId },
    select: { id: true },
  });
  for (const p of eras) {
    await cascadeDeleteEra(tx, p.id);
  }
}

/**
 * Cascade hard-delete a session: SetSession links, participants, media items, then the session itself.
 */
export async function cascadeDeleteSession(
  tx: TxClient,
  sessionId: string,
) {
  // Hard-delete SetSession rows
  await tx.setSession.deleteMany({
    where: { sessionId },
  });

  // Hard-delete SessionTag
  await tx.sessionTag.deleteMany({
    where: { sessionId },
  });

  // Hard-delete contribution skills, then contributions
  await tx.contributionSkill.deleteMany({
    where: { contribution: { sessionId } },
  });
  await tx.sessionContribution.deleteMany({
    where: { sessionId },
  });

  // Collect session media IDs, then cascade hard-delete them
  const sessionMedia = await tx.mediaItem.findMany({
    where: { sessionId },
    select: { id: true },
  });
  await cascadeHardDeleteMediaItems(
    tx,
    sessionMedia.map((m) => m.id),
  );

  await tx.session.delete({
    where: { id: sessionId },
  });
}

// ─── Status projection helpers (ADR-0002) ────────────────────────────────────
// Each entity's `status` column is a projection of its event log. These helpers
// re-derive and persist that status; call them inside the same transaction as
// every event mutation so the projection is always fresh.

const BODY_MARK_STATUS_MAP: Record<string, BodyMarkStatus> = {
  added: "present",
  modified: "modified",
  removed: "removed",
};
const BODY_MODIFICATION_STATUS_MAP: Record<string, BodyModificationStatus> = {
  added: "present",
  modified: "modified",
  removed: "removed",
};
const COSMETIC_PROCEDURE_STATUS_MAP: Record<string, string> = {
  performed: "completed",
  revised: "revised",
  reversed: "reversed",
};

export async function recomputeBodyMarkStatus(tx: TxClient, bodyMarkId: string): Promise<void> {
  const events = await tx.bodyMarkEvent.findMany({
    where: { bodyMarkId },
    orderBy: { date: "asc" },
    select: { eventType: true },
  });
  const last = events[events.length - 1];
  const status: BodyMarkStatus = last ? (BODY_MARK_STATUS_MAP[last.eventType] ?? "present") : "present";
  await tx.bodyMark.update({ where: { id: bodyMarkId }, data: { status } });
}

export async function recomputeBodyModificationStatus(tx: TxClient, bodyModificationId: string): Promise<void> {
  const events = await tx.bodyModificationEvent.findMany({
    where: { bodyModificationId },
    orderBy: { date: "asc" },
    select: { eventType: true },
  });
  const last = events[events.length - 1];
  const status: BodyModificationStatus = last ? (BODY_MODIFICATION_STATUS_MAP[last.eventType] ?? "present") : "present";
  await tx.bodyModification.update({ where: { id: bodyModificationId }, data: { status } });
}

export async function recomputeCosmeticProcedureStatus(tx: TxClient, cosmeticProcedureId: string): Promise<void> {
  const events = await tx.cosmeticProcedureEvent.findMany({
    where: { cosmeticProcedureId },
    orderBy: { date: "asc" },
    select: { eventType: true },
  });
  const last = events[events.length - 1];
  const status: string = last ? (COSMETIC_PROCEDURE_STATUS_MAP[last.eventType] ?? "completed") : "completed";
  await tx.cosmeticProcedure.update({ where: { id: cosmeticProcedureId }, data: { status } });
}
