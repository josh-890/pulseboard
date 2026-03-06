import { prisma } from "@/lib/db";
import type { SkillLevel, SkillEventType } from "@/generated/prisma/client";
import type { PersonSkillItem, PersonSkillEventItem } from "@/lib/types";

// ─── Person Skills (enriched) ────────────────────────────────────────────────

export async function getPersonSkillsEnriched(
  personId: string,
): Promise<PersonSkillItem[]> {
  const skills = await prisma.personSkill.findMany({
    where: { personId },
    include: {
      persona: { select: { label: true } },
      skillDefinition: {
        include: { group: { select: { name: true } } },
      },
      events: {
        where: { deletedAt: null },
        include: {
          persona: { select: { label: true, date: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return skills.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    level: s.level,
    evidence: s.evidence,
    validFrom: s.validFrom,
    validTo: s.validTo,
    personaLabel: s.persona?.label ?? null,
    skillDefinitionId: s.skillDefinitionId,
    groupName: s.skillDefinition?.group.name ?? null,
    definitionName: s.skillDefinition?.name ?? null,
    events: s.events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      level: e.level,
      notes: e.notes,
      personaLabel: e.persona.label,
      personaDate: e.persona.date,
    })),
  }));
}

// ─── Person Skill CRUD ───────────────────────────────────────────────────────

export async function createPersonSkill(data: {
  personId: string;
  personaId?: string | null;
  skillDefinitionId?: string | null;
  name?: string;
  category?: string | null;
  level?: SkillLevel | null;
  evidence?: string | null;
  validFrom?: Date | null;
  validTo?: Date | null;
}) {
  let name = data.name ?? "";
  let category = data.category ?? null;

  // If linked to a definition, copy name/category from it
  if (data.skillDefinitionId) {
    const def = await prisma.skillDefinition.findUnique({
      where: { id: data.skillDefinitionId },
      include: { group: { select: { name: true } } },
    });
    if (def) {
      name = def.name;
      category = def.group.name;
    }
  }

  return prisma.personSkill.create({
    data: {
      personId: data.personId,
      personaId: data.personaId ?? null,
      skillDefinitionId: data.skillDefinitionId ?? null,
      name,
      category,
      level: data.level ?? null,
      evidence: data.evidence ?? null,
      validFrom: data.validFrom ?? null,
      validTo: data.validTo ?? null,
    },
  });
}

export async function updatePersonSkill(
  id: string,
  data: {
    level?: SkillLevel | null;
    evidence?: string | null;
    validFrom?: Date | null;
    validTo?: Date | null;
    personaId?: string | null;
  },
) {
  return prisma.personSkill.update({
    where: { id },
    data,
  });
}

export async function deletePersonSkill(id: string) {
  const deletedAt = new Date();
  return prisma.$transaction(async (tx) => {
    // Soft-delete events
    await tx.personSkillEvent.updateMany({
      where: { personSkillId: id, deletedAt: null },
      data: { deletedAt },
    });
    // Soft-delete the skill
    return tx.personSkill.update({
      where: { id },
      data: { deletedAt },
    });
  });
}

// ─── Skill Events ────────────────────────────────────────────────────────────

export async function createSkillEvent(data: {
  personSkillId: string;
  personaId: string;
  eventType: SkillEventType;
  level?: SkillLevel | null;
  notes?: string | null;
}) {
  return prisma.personSkillEvent.create({
    data: {
      personSkillId: data.personSkillId,
      personaId: data.personaId,
      eventType: data.eventType,
      level: data.level ?? null,
      notes: data.notes ?? null,
    },
  });
}

export async function deleteSkillEvent(id: string) {
  return prisma.personSkillEvent.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

// ─── Skill Timeline ──────────────────────────────────────────────────────────

export async function getSkillTimeline(
  personId: string,
): Promise<
  (PersonSkillEventItem & { skillName: string; skillId: string })[]
> {
  const events = await prisma.personSkillEvent.findMany({
    where: {
      personSkill: { personId },
    },
    include: {
      persona: { select: { label: true, date: true } },
      personSkill: { select: { id: true, name: true } },
    },
    orderBy: { persona: { date: "asc" } },
  });

  return events.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    level: e.level,
    notes: e.notes,
    personaLabel: e.persona.label,
    personaDate: e.persona.date,
    skillName: e.personSkill.name,
    skillId: e.personSkill.id,
  }));
}

// ─── Session Participant Skills ──────────────────────────────────────────────

export async function getSessionParticipantSkills(sessionId: string) {
  return prisma.sessionParticipantSkill.findMany({
    where: { sessionId },
    include: {
      person: {
        include: {
          aliases: {
            where: { type: "common", deletedAt: null },
            take: 1,
          },
        },
      },
      skillDefinition: {
        include: { group: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function addSessionParticipantSkill(
  sessionId: string,
  personId: string,
  skillDefinitionId: string,
  notes?: string | null,
) {
  return prisma.sessionParticipantSkill.create({
    data: {
      sessionId,
      personId,
      skillDefinitionId,
      notes: notes ?? null,
    },
  });
}

export async function removeSessionParticipantSkill(
  sessionId: string,
  personId: string,
  skillDefinitionId: string,
) {
  return prisma.sessionParticipantSkill.delete({
    where: {
      sessionId_personId_skillDefinitionId: {
        sessionId,
        personId,
        skillDefinitionId,
      },
    },
  });
}
