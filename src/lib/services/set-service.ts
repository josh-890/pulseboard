import { prisma } from "@/lib/db";
import type { Prisma, SetType, ContributionRole, ParticipantRole, ResolutionStatus } from "@/generated/prisma/client";
import { cascadeDeleteSet } from "./cascade-helpers";

export type SetFilters = {
  q?: string;
  type?: SetType | "all";
  labelId?: string;
};

export async function getSets(filters: SetFilters = {}) {
  const { q, type, labelId } = filters;

  const where: Prisma.SetWhereInput = {};

  if (type && type !== "all") {
    where.type = type;
  }

  if (q) {
    where.title = { contains: q, mode: "insensitive" };
  }

  if (labelId) {
    where.channel = { labelId };
  }

  return prisma.set.findMany({
    where,
    include: {
      channel: { include: { label: true } },
      session: { include: { project: true } },
      contributions: {
        where: { deletedAt: null, person: { deletedAt: null } },
        include: {
          person: {
            include: {
              aliases: { where: { type: "common", deletedAt: null }, take: 1 },
            },
          },
        },
        orderBy: { role: "asc" },
        take: 5,
      },
    },
    orderBy: { releaseDate: "desc" },
  });
}

export type PaginatedSets = {
  items: Awaited<ReturnType<typeof getSets>>;
  nextCursor: string | null;
  totalCount: number;
};

export async function getSetsPaginated(
  filters: SetFilters = {},
  cursor?: string,
  limit = 50,
): Promise<PaginatedSets> {
  const { q, type, labelId } = filters;

  const where: Prisma.SetWhereInput = {};

  if (type && type !== "all") {
    where.type = type;
  }

  if (q) {
    where.title = { contains: q, mode: "insensitive" };
  }

  if (labelId) {
    where.channel = { labelId };
  }

  const [totalCount, sets] = await Promise.all([
    prisma.set.count({ where }),
    prisma.set.findMany({
      where,
      include: {
        channel: { include: { label: true } },
        session: { include: { project: true } },
        contributions: {
          where: { deletedAt: null },
          include: {
            person: {
              include: {
                aliases: { where: { type: "common", deletedAt: null }, take: 1 },
              },
            },
          },
          orderBy: { role: "asc" },
          take: 5,
        },
      },
      orderBy: { releaseDate: "desc" },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    }),
  ]);

  const hasMore = sets.length > limit;
  const items = hasMore ? sets.slice(0, limit) : sets;
  const nextCursor = hasMore ? items[items.length - 1]!.id : null;

  return { items, nextCursor, totalCount };
}

export async function getSetById(id: string) {
  return prisma.set.findUnique({
    where: { id },
    include: {
      channel: { include: { label: true } },
      session: { include: { project: true } },
      contributions: {
        where: { deletedAt: null, person: { deletedAt: null } },
        include: {
          person: {
            include: {
              aliases: { where: { type: "common", deletedAt: null }, take: 1 },
            },
          },
        },
        orderBy: { role: "asc" },
      },
      creditsRaw: {
        where: { deletedAt: null },
        include: {
          resolvedPerson: {
            include: {
              aliases: { where: { type: "common", deletedAt: null }, take: 1 },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      participants: {
        include: {
          person: {
            include: {
              aliases: { where: { type: "common", deletedAt: null }, take: 1 },
            },
          },
        },
      },
      labelEvidence: {
        include: { label: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function countSets(): Promise<number> {
  return prisma.set.count();
}

export async function createSetRecord(data: {
  sessionId: string;
  type: "photo" | "video";
  title: string;
  channelId?: string;
  description?: string;
  notes?: string;
  releaseDate?: string;
  releaseDatePrecision?: string;
  category?: string;
  genre?: string;
  tags?: string[];
}) {
  return prisma.set.create({
    data: {
      sessionId: data.sessionId,
      type: data.type,
      title: data.title,
      channelId: data.channelId,
      description: data.description,
      notes: data.notes,
      releaseDate: data.releaseDate ? new Date(data.releaseDate) : undefined,
      releaseDatePrecision: (data.releaseDatePrecision as "UNKNOWN" | "YEAR" | "MONTH" | "DAY") ?? "UNKNOWN",
      category: data.category,
      genre: data.genre,
      tags: data.tags ?? [],
    },
  });
}

export async function createSetStandaloneRecord(data: {
  channelId: string;
  type: "photo" | "video";
  title: string;
  description?: string;
  notes?: string;
  releaseDate?: string;
  releaseDatePrecision?: string;
  category?: string;
  genre?: string;
  tags?: string[];
}) {
  const set = await prisma.set.create({
    data: {
      type: data.type,
      title: data.title,
      channelId: data.channelId,
      description: data.description,
      notes: data.notes,
      releaseDate: data.releaseDate ? new Date(data.releaseDate) : undefined,
      releaseDatePrecision: (data.releaseDatePrecision as "UNKNOWN" | "YEAR" | "MONTH" | "DAY") ?? "UNKNOWN",
      category: data.category,
      genre: data.genre,
      tags: data.tags ?? [],
    },
  });
  return { setId: set.id };
}

export async function updateSetRecord(id: string, data: {
  sessionId?: string;
  title?: string;
  channelId?: string | null;
  description?: string | null;
  notes?: string | null;
  releaseDate?: string | null;
  releaseDatePrecision?: string;
  category?: string | null;
  genre?: string | null;
  tags?: string[];
}) {
  return prisma.set.update({
    where: { id },
    data: {
      sessionId: data.sessionId,
      title: data.title,
      channelId: data.channelId,
      description: data.description,
      notes: data.notes,
      releaseDate: data.releaseDate ? new Date(data.releaseDate) : data.releaseDate === null ? null : undefined,
      releaseDatePrecision: (data.releaseDatePrecision as "UNKNOWN" | "YEAR" | "MONTH" | "DAY") ?? undefined,
      category: data.category,
      genre: data.genre,
      tags: data.tags,
    },
  });
}

export async function deleteSetRecord(id: string) {
  const deletedAt = new Date();
  return prisma.$transaction(async (tx) => {
    await cascadeDeleteSet(tx, id, deletedAt);
  });
}

export async function getSessionsForSelect() {
  const sessions = await prisma.session.findMany({
    include: { project: { select: { name: true } } },
    orderBy: [{ project: { name: "asc" } }, { name: "asc" }],
  });
  return sessions.map((s) => ({
    id: s.id,
    name: s.name,
    projectName: s.project?.name ?? null,
  }));
}

export async function getChannelsForSelect() {
  const channels = await prisma.channel.findMany({
    include: { label: { select: { id: true, name: true } } },
    orderBy: [{ label: { name: "asc" } }, { name: "asc" }],
  });
  return channels.map((c) => ({
    id: c.id,
    name: c.name,
    labelName: c.label?.name ?? null,
    labelId: c.label?.id ?? null,
  }));
}

export async function getChannelsWithLabelMaps() {
  const channels = await prisma.channel.findMany({
    include: {
      label: { select: { id: true, name: true } },
      labelMaps: {
        include: { label: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ label: { name: "asc" } }, { name: "asc" }],
  });
  return channels.map((c) => ({
    id: c.id,
    name: c.name,
    labelName: c.label?.name ?? null,
    labelId: c.label?.id ?? null,
    labelMaps: c.labelMaps.map((m) => ({
      labelId: m.labelId,
      labelName: m.label.name,
      confidence: m.confidence,
    })),
  }));
}

// Flow A — standalone: auto-creates project + session from set data (legacy)
export async function createSetWithContextRecord(data: {
  channelId: string;
  type: "photo" | "video";
  title: string;
  description?: string;
  notes?: string;
  releaseDate?: string;
  releaseDatePrecision?: string;
  category?: string;
  genre?: string;
  tags?: string[];
}) {
  return prisma.$transaction(async (tx) => {
    const channel = await tx.channel.findUnique({ where: { id: data.channelId } });
    if (!channel) throw new Error("Channel not found");

    const project = await tx.project.create({
      data: { name: data.title, status: "active" },
    });

    if (channel.labelId) {
      await tx.projectLabel.create({
        data: { projectId: project.id, labelId: channel.labelId },
      });
    }

    const session = await tx.session.create({
      data: {
        projectId: project.id,
        name: data.title,
        date: data.releaseDate ? new Date(data.releaseDate) : undefined,
        datePrecision: (data.releaseDatePrecision as "UNKNOWN" | "YEAR" | "MONTH" | "DAY") ?? "UNKNOWN",
      },
    });

    const set = await tx.set.create({
      data: {
        sessionId: session.id,
        channelId: data.channelId,
        type: data.type,
        title: data.title,
        releaseDate: data.releaseDate ? new Date(data.releaseDate) : undefined,
        releaseDatePrecision: (data.releaseDatePrecision as "UNKNOWN" | "YEAR" | "MONTH" | "DAY") ?? "UNKNOWN",
        category: data.category,
        genre: data.genre,
        description: data.description,
        notes: data.notes,
        tags: data.tags ?? [],
      },
    });

    return { setId: set.id, projectId: project.id };
  });
}

// Flow B — in-session: set belongs to a known session
export async function createSetForSessionRecord(data: {
  sessionId: string;
  projectId: string;
  channelId?: string;
  newChannel?: { name: string; platform?: string; labelId: string };
  type: "photo" | "video";
  title: string;
  description?: string;
  notes?: string;
  releaseDate?: string;
  releaseDatePrecision?: string;
  category?: string;
  genre?: string;
  tags?: string[];
}) {
  return prisma.$transaction(async (tx) => {
    let finalChannelId = data.channelId;

    if (data.newChannel) {
      const created = await tx.channel.create({
        data: {
          labelId: data.newChannel.labelId,
          name: data.newChannel.name,
          platform: data.newChannel.platform,
        },
      });
      finalChannelId = created.id;
    }

    if (finalChannelId) {
      const channel = await tx.channel.findUnique({ where: { id: finalChannelId } });
      if (channel && channel.labelId) {
        await tx.projectLabel.upsert({
          where: {
            projectId_labelId: { projectId: data.projectId, labelId: channel.labelId },
          },
          create: { projectId: data.projectId, labelId: channel.labelId },
          update: {},
        });
      }
    }

    const set = await tx.set.create({
      data: {
        sessionId: data.sessionId,
        channelId: finalChannelId,
        type: data.type,
        title: data.title,
        releaseDate: data.releaseDate ? new Date(data.releaseDate) : undefined,
        releaseDatePrecision: (data.releaseDatePrecision as "UNKNOWN" | "YEAR" | "MONTH" | "DAY") ?? "UNKNOWN",
        category: data.category,
        genre: data.genre,
        description: data.description,
        notes: data.notes,
        tags: data.tags ?? [],
      },
    });

    return { setId: set.id };
  });
}

export async function addContributions(
  setId: string,
  contributions: { personId: string; role: ContributionRole }[],
) {
  if (contributions.length === 0) return;
  await prisma.setContribution.createMany({
    data: contributions.map((c) => ({ setId, personId: c.personId, role: c.role })),
    skipDuplicates: true,
  });
}

export async function searchPersonsForSelect(q: string) {
  const persons = await prisma.person.findMany({
    where: {
      OR: [
        { icgId: { contains: q, mode: "insensitive" } },
        {
          aliases: {
            some: {
              name: { contains: q, mode: "insensitive" },
              type: "common",
              deletedAt: null,
            },
          },
        },
      ],
    },
    include: {
      aliases: { where: { type: "common", deletedAt: null }, take: 1 },
    },
    take: 20,
    orderBy: { createdAt: "asc" },
  });
  return persons.map((p) => ({
    id: p.id,
    icgId: p.icgId,
    commonAlias: p.aliases[0]?.name ?? null,
  }));
}

// ── SetCreditRaw / SetParticipant operations ────────────────────────────────

export async function createSetCreditsRaw(
  setId: string,
  credits: { role: ParticipantRole; rawName: string; resolvedPersonId?: string }[],
) {
  if (credits.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const credit of credits) {
      const isResolved = !!credit.resolvedPersonId;
      await tx.setCreditRaw.create({
        data: {
          setId,
          role: credit.role,
          rawName: credit.rawName,
          resolvedPersonId: credit.resolvedPersonId ?? null,
          resolutionStatus: isResolved ? "RESOLVED" : "UNRESOLVED",
        },
      });

      if (isResolved && credit.resolvedPersonId) {
        await tx.setParticipant.upsert({
          where: {
            setId_personId_role: {
              setId,
              personId: credit.resolvedPersonId,
              role: credit.role,
            },
          },
          create: { setId, personId: credit.resolvedPersonId, role: credit.role },
          update: {},
        });
      }
    }
  });
}

export async function createSetLabelEvidence(
  setId: string,
  evidence: { labelId: string; evidenceType: "CHANNEL_MAP" | "MANUAL"; confidence: number }[],
) {
  if (evidence.length === 0) return;
  await prisma.setLabelEvidence.createMany({
    data: evidence.map((e) => ({
      setId,
      labelId: e.labelId,
      evidenceType: e.evidenceType,
      confidence: e.confidence,
    })),
    skipDuplicates: true,
  });
}

export async function resolveCreditRaw(creditId: string, personId: string) {
  return prisma.$transaction(async (tx) => {
    const credit = await tx.setCreditRaw.update({
      where: { id: creditId },
      data: {
        resolutionStatus: "RESOLVED" as ResolutionStatus,
        resolvedPersonId: personId,
      },
    });

    await tx.setParticipant.upsert({
      where: {
        setId_personId_role: {
          setId: credit.setId,
          personId,
          role: credit.role,
        },
      },
      create: { setId: credit.setId, personId, role: credit.role },
      update: {},
    });

    return credit;
  });
}

export async function ignoreCreditRaw(creditId: string) {
  return prisma.setCreditRaw.update({
    where: { id: creditId },
    data: { resolutionStatus: "IGNORED" as ResolutionStatus },
  });
}

export async function unresolveCreditRaw(creditId: string) {
  return prisma.$transaction(async (tx) => {
    const credit = await tx.setCreditRaw.findUniqueOrThrow({ where: { id: creditId } });

    // Remove the SetParticipant if this was the only credit pointing to that person
    if (credit.resolvedPersonId) {
      const otherCredits = await tx.setCreditRaw.count({
        where: {
          setId: credit.setId,
          role: credit.role,
          resolvedPersonId: credit.resolvedPersonId,
          resolutionStatus: "RESOLVED",
          id: { not: creditId },
          deletedAt: null,
        },
      });

      if (otherCredits === 0) {
        await tx.setParticipant.deleteMany({
          where: {
            setId: credit.setId,
            personId: credit.resolvedPersonId,
            role: credit.role,
          },
        });
      }
    }

    return tx.setCreditRaw.update({
      where: { id: creditId },
      data: {
        resolutionStatus: "UNRESOLVED" as ResolutionStatus,
        resolvedPersonId: null,
      },
    });
  });
}

export async function getSetCredits(setId: string) {
  return prisma.setCreditRaw.findMany({
    where: { setId, deletedAt: null },
    include: {
      resolvedPerson: {
        include: {
          aliases: { where: { type: "common", deletedAt: null }, take: 1 },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

// ── Session assignment ──────────────────────────────────────────────────────

export async function assignSessionToSet(setId: string, sessionId: string) {
  return prisma.set.update({
    where: { id: setId },
    data: { sessionId },
  });
}

export async function unlinkSessionFromSet(setId: string) {
  return prisma.set.update({
    where: { id: setId },
    data: { sessionId: null },
  });
}

export async function copyParticipantsToSession(setId: string, sessionId: string) {
  const participants = await prisma.setParticipant.findMany({
    where: { setId },
  });

  if (participants.length === 0) return;

  await prisma.sessionParticipant.createMany({
    data: participants.map((p) => ({
      sessionId,
      personId: p.personId,
      role: p.role,
    })),
    skipDuplicates: true,
  });
}

export async function searchSessions(q: string) {
  if (!q.trim()) return [];
  return prisma.session.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { project: { name: { contains: q, mode: "insensitive" } } },
      ],
    },
    include: {
      project: { select: { id: true, name: true } },
    },
    take: 20,
    orderBy: { updatedAt: "desc" },
  });
}

export async function createSessionRecord(data: {
  name: string;
  date?: string;
  datePrecision?: string;
  projectId?: string;
  labelId?: string;
}) {
  return prisma.session.create({
    data: {
      name: data.name,
      projectId: data.projectId,
      labelId: data.labelId,
      date: data.date ? new Date(data.date) : undefined,
      datePrecision: (data.datePrecision as "UNKNOWN" | "YEAR" | "MONTH" | "DAY") ?? "UNKNOWN",
      status: "DRAFT",
    },
  });
}
