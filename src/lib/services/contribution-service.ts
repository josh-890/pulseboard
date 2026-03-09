import { prisma } from "@/lib/db";
import type { SkillLevel } from "@/generated/prisma/client";
import { SKILL_LEVEL_VALUE } from "@/lib/constants/skill";
import type { TxClient } from "./cascade-helpers";

// ─── Session Contributions ──────────────────────────────────────────────────

export async function getSessionContributions(sessionId: string) {
  return prisma.sessionContribution.findMany({
    where: { sessionId },
    include: {
      person: {
        include: {
          aliases: { where: { type: "common" }, take: 1 },
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
  opts?: { creditNameOverride?: string; notes?: string },
) {
  return prisma.sessionContribution.create({
    data: {
      sessionId,
      personId,
      roleDefinitionId,
      creditNameOverride: opts?.creditNameOverride ?? null,
      notes: opts?.notes ?? null,
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

  // 2. Get all contributions from linked sessions
  const contributions = await tx.sessionContribution.findMany({
    where: { sessionId: { in: sessionIds } },
    select: { personId: true, roleDefinitionId: true },
    distinct: ["personId", "roleDefinitionId"],
  });

  // 3. Wipe existing set participants
  await tx.setParticipant.deleteMany({ where: { setId } });

  // 4. Rebuild
  if (contributions.length > 0) {
    await tx.setParticipant.createMany({
      data: contributions.map((c) => ({
        setId,
        personId: c.personId,
        roleDefinitionId: c.roleDefinitionId,
      })),
      skipDuplicates: true,
    });
  }
}
