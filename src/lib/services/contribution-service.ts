import { prisma } from "@/lib/db";
import type { ParticipationConfidence, ConfidenceSource } from "@/generated/prisma/client";
import { normalizeForSearch } from "@/lib/normalize";
import { CONFIDENCE_RANK } from "@/lib/constants/confidence";
import type { TxClient } from "./cascade-helpers";
import { BEHIND_CAMERA_ROLE, type BehindCameraCredit } from "./session-contributors";
import { syncPromotedStagingCasts } from "./set-cast-service";

// ─── Session Contributions ──────────────────────────────────────────────────

/**
 * Behind-camera credits on this session's sets (ADR-0021). The session contributor
 * list unions these (read-only) with the Person `SessionContribution`s. A credit is
 * behind-camera when its role's group is of kind BEHIND_CAMERA; ignored credits are
 * excluded. Shown whether resolved to an Artist or still raw.
 */
export async function getSessionBehindCameraCredits(
  sessionId: string,
): Promise<BehindCameraCredit[]> {
  const links = await prisma.setSession.findMany({
    where: { sessionId },
    select: { setId: true },
  });
  const setIds = links.map((l) => l.setId);
  if (setIds.length === 0) return [];

  const credits = await prisma.setCreditRaw.findMany({
    where: {
      setId: { in: setIds },
      resolutionStatus: { not: "IGNORED" },
      roleDefinition: BEHIND_CAMERA_ROLE,
    },
    select: {
      rawName: true,
      resolvedArtist: { select: { id: true, name: true } },
      roleDefinition: { select: { name: true } },
    },
  });

  return credits.map((c) => ({
    artistId: c.resolvedArtist?.id ?? null,
    resolvedArtistName: c.resolvedArtist?.name ?? null,
    rawName: c.rawName,
    roleName: c.roleDefinition?.name ?? "Photographer",
  }));
}

export async function addSessionContribution(
  sessionId: string,
  personId: string,
  roleDefinitionId: string,
  opts?: {
    creditNameOverride?: string;
    notes?: string;
    confidence?: ParticipationConfidence;
    confidenceSource?: ConfidenceSource;
    confirmedAt?: Date | null;
    resolvedAliasId?: string | null;
    eraId?: string | null;
  },
) {
  // Auto-match creditNameOverride to a known alias if resolvedAliasId not provided
  let resolvedAliasId = opts?.resolvedAliasId ?? null;
  if (!resolvedAliasId && opts?.creditNameOverride) {
    const nameNorm = normalizeForSearch(opts.creditNameOverride);
    const match = await prisma.personAlias.findFirst({
      where: { personId, nameNorm },
      select: { id: true },
    });
    resolvedAliasId = match?.id ?? null;
  }

  // ADR-0004: a Session is one shoot = one point in time = one Era. If the
  // caller passed an explicit eraId, propagate it across every existing
  // contribution row for this person in this session so multi-role
  // participants stay consistent.
  return prisma.$transaction(async (tx) => {
    const created = await tx.sessionContribution.create({
      data: {
        sessionId,
        personId,
        roleDefinitionId,
        creditNameOverride: opts?.creditNameOverride ?? null,
        notes: opts?.notes ?? null,
        confidence: opts?.confidence ?? "CONFIRMED",
        confidenceSource: opts?.confidenceSource ?? "MANUAL",
        confirmedAt: opts?.confirmedAt ?? null,
        resolvedAliasId,
        eraId: opts?.eraId ?? null,
      },
    });
    if (opts?.eraId !== undefined) {
      await tx.sessionContribution.updateMany({
        where: { sessionId, personId, id: { not: created.id } },
        data: { eraId: opts.eraId },
      });
    }
    return created;
  });
}

export async function removeSessionContribution(contributionId: string) {
  return prisma.$transaction(async (tx) => {
    // Look up person and session before deleting
    const contribution = await tx.sessionContribution.findUniqueOrThrow({
      where: { id: contributionId },
      select: { personId: true, sessionId: true },
    });

    // Clean up all PersonMediaLinks for this person's media in the session
    const mediaItems = await tx.mediaItem.findMany({
      where: { sessionId: contribution.sessionId },
      select: { id: true },
    });
    if (mediaItems.length > 0) {
      await tx.personMediaLink.deleteMany({
        where: {
          personId: contribution.personId,
          mediaItemId: { in: mediaItems.map((m) => m.id) },
        },
      });
    }

    return tx.sessionContribution.delete({
      where: { id: contributionId },
    });
  });
}

export async function updateSessionContribution(
  contributionId: string,
  data: { creditNameOverride?: string | null; notes?: string | null; eraId?: string | null },
) {
  // ADR-0004: keep the eraId consistent across every contribution row for
  // this person in this session.
  if (data.eraId !== undefined) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.sessionContribution.update({
        where: { id: contributionId },
        data,
      });
      await tx.sessionContribution.updateMany({
        where: {
          sessionId: updated.sessionId,
          personId: updated.personId,
          id: { not: updated.id },
        },
        data: { eraId: data.eraId },
      });
      return updated;
    });
  }
  return prisma.sessionContribution.update({
    where: { id: contributionId },
    data,
  });
}

/**
 * Switch an on-camera contribution between roles of its group — Model ↔ Appearance
 * (2026-10-24). Someone only appearing carries no intensity, so moving to a SUPPORT
 * role drops the contribution's acts and extras (the UI confirms first). The sets'
 * cast cache follows in the same transaction.
 */
export async function setContributionRole(contributionId: string, roleDefinitionId: string) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.sessionContribution.findUniqueOrThrow({
      where: { id: contributionId },
      select: { sessionId: true, personId: true, roleDefinitionId: true, roleDefinition: { select: { group: { select: { kind: true } } } } },
    });
    if (c.roleDefinitionId === roleDefinitionId) return { droppedActs: 0 };
    const role = await tx.contributionRoleDefinition.findUniqueOrThrow({
      where: { id: roleDefinitionId },
      select: { presence: true, group: { select: { kind: true } } },
    });
    if (c.roleDefinition.group.kind !== "ON_CAMERA" || role.group.kind !== "ON_CAMERA") {
      throw new Error("Only an on-camera role can be switched, and only to another on-camera role");
    }
    const taken = await tx.sessionContribution.findFirst({
      where: { sessionId: c.sessionId, personId: c.personId, roleDefinitionId },
      select: { id: true },
    });
    if (taken) throw new Error("This person already has that role in the session");

    let droppedActs = 0;
    if (role.presence === "SUPPORT") {
      droppedActs = (await tx.contributionAct.deleteMany({ where: { contributionId } })).count;
      await tx.contributionExtra.deleteMany({ where: { contributionId } });
    }
    await tx.sessionContribution.update({ where: { id: contributionId }, data: { roleDefinitionId } });

    const links = await tx.setSession.findMany({ where: { sessionId: c.sessionId }, select: { setId: true } });
    for (const l of links) await rebuildSetParticipantsFromContributions(tx, l.setId);
    return { droppedActs };
  });
}

// ─── SetParticipant Rebuild ─────────────────────────────────────────────────

/**
 * Rebuilds SetParticipant for a set from SessionContribution via SetSession links.
 * Wipe + rebuild pattern ensures consistency.
 * Deduplicates by (personId, roleDefinitionId), keeping the highest confidence.
 */
export async function rebuildSetParticipantsFromContributions(
  tx: TxClient,
  setId: string,
) {
  // 1. Get all linked sessions
  const links = await tx.setSession.findMany({
    where: { setId },
    select: { sessionId: true },
  });
  if (!links.length) {
    await tx.setParticipant.deleteMany({ where: { setId } });
    await syncPromotedStagingCasts(tx, setId);
    return;
  }

  const sessionIds = links.map((l) => l.sessionId);

  // 2. Get all contributions with confidence fields
  const contributions = await tx.sessionContribution.findMany({
    where: { sessionId: { in: sessionIds } },
    select: {
      personId: true,
      roleDefinitionId: true,
      confidence: true,
      confidenceSource: true,
      confirmedAt: true,
    },
  });

  // 3. Dedup by (personId, roleDefinitionId), keeping highest confidence
  const dedupMap = new Map<
    string,
    {
      personId: string;
      roleDefinitionId: string;
      confidence: ParticipationConfidence;
      confidenceSource: ConfidenceSource;
      confirmedAt: Date | null;
    }
  >();
  for (const c of contributions) {
    const key = `${c.personId}:${c.roleDefinitionId}`;
    const existing = dedupMap.get(key);
    if (!existing || CONFIDENCE_RANK[c.confidence] > CONFIDENCE_RANK[existing.confidence]) {
      dedupMap.set(key, {
        personId: c.personId,
        roleDefinitionId: c.roleDefinitionId,
        confidence: c.confidence,
        confidenceSource: c.confidenceSource,
        confirmedAt: c.confirmedAt,
      });
    }
  }

  // 4. Wipe existing set participants
  await tx.setParticipant.deleteMany({ where: { setId } });

  // 5. Rebuild with confidence
  const deduped = Array.from(dedupMap.values());
  if (deduped.length > 0) {
    await tx.setParticipant.createMany({
      data: deduped.map((c) => ({
        setId,
        personId: c.personId,
        roleDefinitionId: c.roleDefinitionId,
        confidence: c.confidence,
        confidenceSource: c.confidenceSource,
        confirmedAt: c.confirmedAt,
      })),
      skipDuplicates: true,
    });
  }

  // The staging sets promoted into this set follow its cast
  await syncPromotedStagingCasts(tx, setId);
}

/**
 * Update confidence on a SessionContribution and rebuild SetParticipant cache.
 */
export async function updateSessionContributionConfidence(
  contributionId: string,
  confidence: ParticipationConfidence,
) {
  return prisma.$transaction(async (tx) => {
    const contribution = await tx.sessionContribution.update({
      where: { id: contributionId },
      data: {
        confidence,
        confidenceSource: "MANUAL",
        confirmedAt: confidence === "CONFIRMED" ? new Date() : null,
      },
    });

    // Rebuild SetParticipant for all sets linked to this session
    const setLinks = await tx.setSession.findMany({
      where: { sessionId: contribution.sessionId },
      select: { setId: true },
    });
    for (const link of setLinks) {
      await rebuildSetParticipantsFromContributions(tx, link.setId);
    }

    return contribution;
  });
}

// ─── Contributors with entities (for lightbox entity linking) ─────────────

export type ContributorWithEntities = {
  personId: string;
  personName: string;
  bodyMarks: { id: string; name: string }[];
  bodyModifications: { id: string; name: string }[];
  cosmeticProcedures: { id: string; name: string }[];
};

export async function getContributorsWithEntities(
  sessionId: string,
): Promise<ContributorWithEntities[]> {
  const contributions = await prisma.sessionContribution.findMany({
    where: { sessionId },
    select: {
      personId: true,
      person: {
        select: {
          aliases: { where: { isCommon: true }, take: 1, select: { name: true } },
          bodyMarks: {
            select: { id: true, type: true, bodyRegion: true },
            orderBy: { createdAt: "asc" },
          },
          bodyModifications: {
            select: { id: true, type: true, bodyRegion: true },
            orderBy: { createdAt: "asc" },
          },
          cosmeticProcedures: {
            select: { id: true, type: true, bodyRegion: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
    distinct: ["personId"],
    orderBy: { createdAt: "asc" },
  });

  return contributions.map((c) => ({
    personId: c.personId,
    personName: c.person.aliases[0]?.name ?? c.personId,
    bodyMarks: c.person.bodyMarks.map((m) => ({
      id: m.id,
      name: `${m.type} — ${m.bodyRegion}`,
    })),
    bodyModifications: c.person.bodyModifications.map((m) => ({
      id: m.id,
      name: `${m.type} — ${m.bodyRegion}`,
    })),
    cosmeticProcedures: c.person.cosmeticProcedures.map((m) => ({
      id: m.id,
      name: `${m.type} — ${m.bodyRegion}`,
    })),
  }));
}
