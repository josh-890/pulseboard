import { prisma } from "@/lib/db";
import type { Prisma, SetType, ContributionRole } from "@/generated/prisma/client";
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

// Flow A — standalone: auto-creates project + session from set data
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
