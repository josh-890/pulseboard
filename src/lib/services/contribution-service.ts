import { prisma } from "@/lib/db";
import type { SkillLevel, ParticipationConfidence, ConfidenceSource } from "@/generated/prisma/client";
import { SKILL_LEVEL_VALUE } from "@/lib/constants/skill";
import { CONFIDENCE_RANK } from "@/lib/constants/confidence";
import { buildUrl } from "@/lib/media-url";
import type { TxClient } from "./cascade-helpers";

// ─── Session Contributions ──────────────────────────────────────────────────

export async function getSessionContributions(sessionId: string) {
  return prisma.sessionContribution.findMany({
    where: { sessionId },
    include: {
      person: {
        include: {
          aliases: { where: { isCommon: true }, take: 1 },
        },
      },
      roleDefinition: {
        include: { group: true },
      },
      skills: {
        include: {
          skillDefinition: {
            include: { group: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export type EnrichedContribution = Awaited<
  ReturnType<typeof getSessionContributions>
>[number];

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
  },
) {
  return prisma.sessionContribution.create({
    data: {
      sessionId,
      personId,
      roleDefinitionId,
      creditNameOverride: opts?.creditNameOverride ?? null,
      notes: opts?.notes ?? null,
      confidence: opts?.confidence ?? "CONFIRMED",
      confidenceSource: opts?.confidenceSource ?? "MANUAL",
      confirmedAt: opts?.confirmedAt ?? null,
    },
  });
}

export async function removeSessionContribution(contributionId: string) {
  return prisma.$transaction(async (tx) => {
    // Cascade delete skills first
    await tx.contributionSkill.deleteMany({
      where: { contributionId },
    });
    return tx.sessionContribution.delete({
      where: { id: contributionId },
    });
  });
}

export async function updateSessionContribution(
  contributionId: string,
  data: { creditNameOverride?: string | null; notes?: string | null },
) {
  return prisma.sessionContribution.update({
    where: { id: contributionId },
    data,
  });
}

// ─── Contribution Skills ────────────────────────────────────────────────────

export async function addContributionSkill(
  contributionId: string,
  skillDefinitionId: string,
  level?: SkillLevel | null,
  notes?: string | null,
) {
  return prisma.$transaction(async (tx) => {
    // 1. Create ContributionSkill
    const cs = await tx.contributionSkill.create({
      data: {
        contributionId,
        skillDefinitionId,
        level: level ?? null,
        notes: notes ?? null,
      },
    });

    // 2. Find the contribution for person context
    const contribution = await tx.sessionContribution.findUniqueOrThrow({
      where: { id: contributionId },
      select: { personId: true, sessionId: true },
    });

    // 3. Find baseline persona
    const baselinePersona = await tx.persona.findFirst({
      where: { personId: contribution.personId, isBaseline: true },
    });
    if (!baselinePersona) return { cs, demonstratedEventId: null };

    // 4. Find or create PersonSkill
    let personSkill = await tx.personSkill.findFirst({
      where: { personId: contribution.personId, skillDefinitionId },
    });

    if (!personSkill) {
      const def = await tx.skillDefinition.findUnique({
        where: { id: skillDefinitionId },
        include: { group: { select: { name: true } } },
      });
      personSkill = await tx.personSkill.create({
        data: {
          personId: contribution.personId,
          personaId: baselinePersona.id,
          skillDefinitionId,
          name: def?.name ?? "",
          category: def?.group.name ?? null,
          level: level ?? null,
        },
      });
    } else {
      if (!personSkill.personaId) {
        personSkill = await tx.personSkill.update({
          where: { id: personSkill.id },
          data: { personaId: baselinePersona.id },
        });
      }
      // Progressive level upgrade
      if (level && personSkill.level) {
        if (SKILL_LEVEL_VALUE[level] > SKILL_LEVEL_VALUE[personSkill.level]) {
          personSkill = await tx.personSkill.update({
            where: { id: personSkill.id },
            data: { level },
          });
        }
      } else if (level && !personSkill.level) {
        personSkill = await tx.personSkill.update({
          where: { id: personSkill.id },
          data: { level },
        });
      }
    }

    // 5. Create DEMONSTRATED event
    const session = await tx.session.findUnique({
      where: { id: contribution.sessionId },
      select: { name: true, date: true, datePrecision: true },
    });

    const event = await tx.personSkillEvent.create({
      data: {
        personSkillId: personSkill.id,
        personaId: baselinePersona.id,
        eventType: "DEMONSTRATED",
        level: level ?? null,
        date: session?.date ?? null,
        datePrecision: session?.datePrecision ?? "UNKNOWN",
        notes: `[session:${contribution.sessionId}] Demonstrated in session: ${session?.name ?? "Unknown"}`,
      },
    });

    return { cs, demonstratedEventId: event.id };
  });
}

export async function removeContributionSkill(contributionSkillId: string) {
  return prisma.$transaction(async (tx) => {
    const cs = await tx.contributionSkill.findUniqueOrThrow({
      where: { id: contributionSkillId },
      include: {
        contribution: { select: { personId: true, sessionId: true } },
      },
    });

    // Delete the contribution skill
    await tx.contributionSkill.delete({
      where: { id: contributionSkillId },
    });

    // Find and delete the auto-created DEMONSTRATED event
    const personSkill = await tx.personSkill.findFirst({
      where: {
        personId: cs.contribution.personId,
        skillDefinitionId: cs.skillDefinitionId,
      },
    });

    if (personSkill) {
      const event = await tx.personSkillEvent.findFirst({
        where: {
          personSkillId: personSkill.id,
          eventType: "DEMONSTRATED",
          notes: { contains: `[session:${cs.contribution.sessionId}]` },
        },
        orderBy: { createdAt: "desc" },
      });

      if (event) {
        await tx.skillEventMedia.deleteMany({
          where: { skillEventId: event.id },
        });
        await tx.personSkillEvent.delete({
          where: { id: event.id },
        });
      }
    }
  });
}

export async function updateContributionSkillLevel(
  contributionSkillId: string,
  level: SkillLevel | null,
) {
  return prisma.$transaction(async (tx) => {
    const cs = await tx.contributionSkill.findUniqueOrThrow({
      where: { id: contributionSkillId },
      include: {
        contribution: { select: { personId: true, sessionId: true } },
      },
    });

    // 1. Update ContributionSkill level
    await tx.contributionSkill.update({
      where: { id: contributionSkillId },
      data: { level },
    });

    // 2. Update the tagged DEMONSTRATED event's level
    const personSkill = await tx.personSkill.findFirst({
      where: {
        personId: cs.contribution.personId,
        skillDefinitionId: cs.skillDefinitionId,
      },
    });
    if (!personSkill) return;

    const event = await tx.personSkillEvent.findFirst({
      where: {
        personSkillId: personSkill.id,
        eventType: "DEMONSTRATED",
        notes: { contains: `[session:${cs.contribution.sessionId}]` },
      },
      orderBy: { createdAt: "desc" },
    });
    if (event) {
      await tx.personSkillEvent.update({
        where: { id: event.id },
        data: { level },
      });
    }

    // 3. Recompute PersonSkill.level as max across all events
    const allEvents = await tx.personSkillEvent.findMany({
      where: { personSkillId: personSkill.id, level: { not: null } },
      select: { level: true },
    });
    let maxLevel: SkillLevel | null = null;
    let maxValue = 0;
    for (const ev of allEvents) {
      if (ev.level && SKILL_LEVEL_VALUE[ev.level] > maxValue) {
        maxValue = SKILL_LEVEL_VALUE[ev.level];
        maxLevel = ev.level;
      }
    }
    await tx.personSkill.update({
      where: { id: personSkill.id },
      data: { level: maxLevel },
    });
  });
}

// ─── Contribution Skill Media Query ──────────────────────────────────────────

type ContributionSkillMediaItem = {
  id: string;
  thumbUrl: string;
};

/**
 * For each contribution skill in a session, look up the linked PersonSkillEvent
 * (DEMONSTRATED, tagged with this session) and return its media.
 * Returns a map: contributionSkillId → media items[].
 */
export async function getContributionSkillMediaMap(
  sessionId: string,
): Promise<Map<string, ContributionSkillMediaItem[]>> {


  // Get all contribution skills for this session with person + skill info
  const contributions = await prisma.sessionContribution.findMany({
    where: { sessionId },
    include: {
      skills: {
        select: {
          id: true,
          skillDefinitionId: true,
          contribution: { select: { personId: true } },
        },
      },
    },
  });

  const allSkills = contributions.flatMap((c) => c.skills);
  if (allSkills.length === 0) return new Map();

  // Batch-fetch person skills for all person+skillDefinition combos
  const personSkills = await prisma.personSkill.findMany({
    where: {
      OR: allSkills.map((s) => ({
        personId: s.contribution.personId,
        skillDefinitionId: s.skillDefinitionId,
      })),
    },
    select: { id: true, personId: true, skillDefinitionId: true },
  });

  const psMap = new Map<string, string>();
  for (const ps of personSkills) {
    psMap.set(`${ps.personId}:${ps.skillDefinitionId}`, ps.id);
  }

  // Find DEMONSTRATED events tagged with this session
  const personSkillIds = [...new Set(personSkills.map((ps) => ps.id))];
  if (personSkillIds.length === 0) return new Map();

  const events = await prisma.personSkillEvent.findMany({
    where: {
      personSkillId: { in: personSkillIds },
      eventType: "DEMONSTRATED",
      notes: { contains: `[session:${sessionId}]` },
    },
    include: {
      media: {
        include: {
          mediaItem: {
            select: { id: true, variants: true, fileRef: true },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
      personSkill: { select: { personId: true, skillDefinitionId: true } },
    },
  });

  // Build reverse map: personId+skillDefId → event media
  const eventMediaMap = new Map<string, ContributionSkillMediaItem[]>();
  for (const event of events) {
    const key = `${event.personSkill.personId}:${event.personSkill.skillDefinitionId}`;
    const items = event.media.map((sem) => {
      const variants = (sem.mediaItem.variants ?? {}) as Record<string, string>;
      const thumbKey = variants.gallery_512 ?? variants.original ?? sem.mediaItem.fileRef ?? "";
      return {
        id: sem.mediaItem.id,
        thumbUrl: thumbKey ? buildUrl(thumbKey) : "",
      };
    });
    const existing = eventMediaMap.get(key) ?? [];
    eventMediaMap.set(key, [...existing, ...items]);
  }

  // Map back to contribution skill IDs
  const result = new Map<string, ContributionSkillMediaItem[]>();
  for (const skill of allSkills) {
    const key = `${skill.contribution.personId}:${skill.skillDefinitionId}`;
    const media = eventMediaMap.get(key);
    if (media && media.length > 0) {
      result.set(skill.id, media);
    }
  }

  return result;
}

// ─── Contribution Skill Media Helpers ────────────────────────────────────────

export async function addMediaToContributionSkill(
  contributionSkillId: string,
  mediaItemIds: string[],
) {
  if (mediaItemIds.length === 0) return;
  const cs = await prisma.contributionSkill.findUniqueOrThrow({
    where: { id: contributionSkillId },
    include: {
      contribution: { select: { personId: true, sessionId: true } },
    },
  });

  const personSkill = await prisma.personSkill.findFirst({
    where: {
      personId: cs.contribution.personId,
      skillDefinitionId: cs.skillDefinitionId,
    },
  });
  if (!personSkill) return;

  const event = await prisma.personSkillEvent.findFirst({
    where: {
      personSkillId: personSkill.id,
      eventType: "DEMONSTRATED",
      notes: { contains: `[session:${cs.contribution.sessionId}]` },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!event) return;

  await prisma.skillEventMedia.createMany({
    data: mediaItemIds.map((mediaItemId, i) => ({
      skillEventId: event.id,
      mediaItemId,
      sortOrder: i,
    })),
    skipDuplicates: true,
  });
}

export async function removeMediaFromContributionSkill(
  contributionSkillId: string,
  mediaItemId: string,
) {
  const cs = await prisma.contributionSkill.findUniqueOrThrow({
    where: { id: contributionSkillId },
    include: {
      contribution: { select: { personId: true, sessionId: true } },
    },
  });

  const personSkill = await prisma.personSkill.findFirst({
    where: {
      personId: cs.contribution.personId,
      skillDefinitionId: cs.skillDefinitionId,
    },
  });
  if (!personSkill) return;

  const event = await prisma.personSkillEvent.findFirst({
    where: {
      personSkillId: personSkill.id,
      eventType: "DEMONSTRATED",
      notes: { contains: `[session:${cs.contribution.sessionId}]` },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!event) return;

  await prisma.skillEventMedia.delete({
    where: {
      skillEventId_mediaItemId: { skillEventId: event.id, mediaItemId },
    },
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
