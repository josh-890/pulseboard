import { prisma } from "@/lib/db";
import type { Prisma, SessionStatus, SessionType } from "@/generated/prisma/client";
import { normalizeForSearch } from "@/lib/normalize";
import { cascadeDeleteSession } from "./cascade-helpers";
import { rebuildSetParticipantsFromContributions } from "./contribution-service";
import { CONFIDENCE_RANK } from "@/lib/constants/confidence";

const personSelect = {
  select: {
    id: true,
    icgId: true,
    aliases: { where: { isCommon: true }, take: 1 },
  },
} as const;

export type SessionSort =
  | "newest"
  | "date-desc"
  | "date-asc"
  | "name-asc"
  | "media-desc";

export type SessionFilters = {
  q?: string;
  status?: SessionStatus | "all";
  type?: SessionType | "all";
  labelId?: string;
  projectId?: string;
  sort?: SessionSort;
};

export async function getSessions(filters: SessionFilters = {}) {
  const { q, status, type, labelId, projectId } = filters;

  const where: Prisma.SessionWhereInput = {};

  if (status && status !== "all") {
    where.status = status;
  }

  if (type && type !== "all") {
    where.type = type;
  }

  if (q) {
    where.name = { contains: q, mode: "insensitive" };
  }

  if (labelId) {
    where.labelId = labelId;
  }

  if (projectId) {
    where.projectId = projectId;
  }

  return prisma.session.findMany({
    where,
    include: {
      project: { select: { id: true, name: true } },
      label: { select: { id: true, name: true } },
      person: personSelect,
      contributions: {
        include: {
          person: {
            include: {
              aliases: { where: { isCommon: true }, take: 1 },
            },
          },
          roleDefinition: { include: { group: true } },
        },
      },
      setSessionLinks: {
        select: { set: { select: { type: true } } },
      },
      _count: {
        select: {
          mediaItems: true,
          setSessionLinks: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

function getSessionOrderBy(sort?: SessionSort): Prisma.SessionOrderByWithRelationInput[] {
  switch (sort) {
    case "date-desc":
      return [{ date: { sort: "desc", nulls: "last" } }];
    case "date-asc":
      return [{ date: { sort: "asc", nulls: "last" } }];
    case "name-asc":
      return [{ name: "asc" }];
    case "media-desc":
      return [{ mediaItems: { _count: "desc" } }];
    case "newest":
    default:
      return [{ createdAt: "desc" }];
  }
}

export type PaginatedSessions = {
  items: Awaited<ReturnType<typeof getSessions>>;
  nextCursor: string | null;
  totalCount: number;
};

export async function getSessionsPaginated(
  filters: SessionFilters = {},
  cursor?: string,
  limit = 50,
): Promise<PaginatedSessions> {
  const { q, status, type, labelId, projectId, sort } = filters;

  const where: Prisma.SessionWhereInput = {};

  if (status && status !== "all") {
    where.status = status;
  }

  if (type && type !== "all") {
    where.type = type;
  }

  if (q) {
    where.name = { contains: q, mode: "insensitive" };
  }

  if (labelId) {
    where.labelId = labelId;
  }

  if (projectId) {
    where.projectId = projectId;
  }

  const orderBy = getSessionOrderBy(sort);

  const [totalCount, sessions] = await Promise.all([
    prisma.session.count({ where }),
    prisma.session.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        label: { select: { id: true, name: true } },
        person: personSelect,
        contributions: {
          include: {
            person: {
              include: {
                aliases: { where: { isCommon: true }, take: 1 },
              },
            },
            roleDefinition: { include: { group: true } },
          },
        },
        setSessionLinks: {
          select: { set: { select: { type: true } } },
        },
        _count: {
          select: {
            mediaItems: true,
            setSessionLinks: true,
          },
        },
      },
      orderBy,
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    }),
  ]);

  const hasMore = sessions.length > limit;
  const items = hasMore ? sessions.slice(0, limit) : sessions;
  const nextCursor = hasMore ? items[items.length - 1]!.id : null;

  return { items, nextCursor, totalCount };
}

export async function getSessionById(id: string) {
  return prisma.session.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      label: { select: { id: true, name: true } },
      person: personSelect,
      contributions: {
        include: {
          person: {
            include: {
              aliases: { where: { isCommon: true }, take: 1 },
            },
          },
          roleDefinition: { include: { group: true } },
        },
      },
      setSessionLinks: {
        include: {
          set: {
            select: {
              id: true,
              title: true,
              type: true,
              releaseDate: true,
              releaseDatePrecision: true,
              channel: {
                select: {
                  id: true,
                  name: true,
                  labelMaps: { include: { label: { select: { id: true, name: true } } } },
                },
              },
            },
          },
        },
        orderBy: { isPrimary: "desc" },
      },
      _count: {
        select: {
          mediaItems: true,
        },
      },
    },
  });
}

export async function countSessions(): Promise<number> {
  return prisma.session.count();
}

export async function createSessionRecord(data: {
  name: string;
  projectId?: string;
  labelId?: string;
  description?: string;
  location?: string;
  status?: "DRAFT" | "CONFIRMED";
  notes?: string;
  date?: string;
  datePrecision?: string;
}) {
  return prisma.session.create({
    data: {
      name: data.name,
      nameNorm: normalizeForSearch(data.name),
      projectId: data.projectId || undefined,
      labelId: data.labelId || undefined,
      description: data.description,
      location: data.location,
      status: (data.status as SessionStatus) ?? "DRAFT",
      notes: data.notes,
      date: data.date ? new Date(data.date) : undefined,
      datePrecision: (data.datePrecision as "UNKNOWN" | "YEAR" | "MONTH" | "DAY") ?? "UNKNOWN",
    },
  });
}

export async function updateSessionRecord(
  id: string,
  data: {
    name?: string;
    projectId?: string | null;
    labelId?: string | null;
    description?: string | null;
    location?: string | null;
    status?: string;
    notes?: string | null;
    date?: string | null;
    datePrecision?: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    // Guard: prevent editing reference sessions (inside tx to avoid TOCTOU)
    const existing = await tx.session.findFirst({ where: { id }, select: { type: true } });
    if (existing?.type === "REFERENCE") {
      throw new Error("Cannot edit a reference session");
    }

    return tx.session.update({
      where: { id },
      data: {
        name: data.name,
        nameNorm: data.name ? normalizeForSearch(data.name) : undefined,
        projectId: data.projectId,
        labelId: data.labelId,
        description: data.description,
        location: data.location,
        status: data.status ? (data.status as SessionStatus) : undefined,
        notes: data.notes,
        date: data.date ? new Date(data.date) : data.date === null ? null : undefined,
        datePrecision: (data.datePrecision as "UNKNOWN" | "YEAR" | "MONTH" | "DAY") ?? undefined,
      },
    });
  });
}

export async function deleteSessionRecord(id: string) {
  return prisma.$transaction(async (tx) => {
    // Guard: prevent manual deletion of REFERENCE sessions (inside tx to avoid TOCTOU)
    const session = await tx.session.findFirst({ where: { id }, select: { type: true } });
    if (session?.type === "REFERENCE") {
      throw new Error("Reference sessions can only be deleted by deleting the associated person");
    }

    await cascadeDeleteSession(tx, id);
  });
}

export async function mergeSessionsRecord(survivingId: string, absorbedId: string) {
  return prisma.$transaction(async (tx) => {
    // Guard: reference sessions cannot be merged
    const [surviving, absorbed] = await Promise.all([
      tx.session.findFirst({ where: { id: survivingId }, select: { type: true } }),
      tx.session.findFirst({ where: { id: absorbedId }, select: { type: true } }),
    ]);
    if (surviving?.type === "REFERENCE" || absorbed?.type === "REFERENCE") {
      throw new Error("Reference sessions cannot be merged");
    }

    // 1. Reassign MediaItems from absorbed → surviving
    await tx.mediaItem.updateMany({
      where: { sessionId: absorbedId },
      data: { sessionId: survivingId },
    });

    // 2. Merge SessionContributions (upsert to avoid dupes)
    const absorbedContributions = await tx.sessionContribution.findMany({
      where: { sessionId: absorbedId },
      include: { skills: true },
    });
    for (const c of absorbedContributions) {
      const existing = await tx.sessionContribution.findUnique({
        where: {
          sessionId_personId_roleDefinitionId: {
            sessionId: survivingId,
            personId: c.personId,
            roleDefinitionId: c.roleDefinitionId,
          },
        },
      });
      if (existing) {
        // Merge skills into existing contribution
        for (const skill of c.skills) {
          await tx.contributionSkill.upsert({
            where: {
              contributionId_skillDefinitionId: {
                contributionId: existing.id,
                skillDefinitionId: skill.skillDefinitionId,
              },
            },
            create: {
              contributionId: existing.id,
              skillDefinitionId: skill.skillDefinitionId,
              level: skill.level,
              notes: skill.notes,
            },
            update: {},
          });
        }
        // Keep higher confidence from absorbed contribution
        const absorbedRank = CONFIDENCE_RANK[c.confidence];
        const existingRank = CONFIDENCE_RANK[existing.confidence];
        if (absorbedRank > existingRank) {
          await tx.sessionContribution.update({
            where: { id: existing.id },
            data: {
              confidence: c.confidence,
              confidenceSource: c.confidenceSource,
              confirmedAt: c.confirmedAt,
            },
          });
        }
      } else {
        // Move contribution to surviving session
        await tx.contributionSkill.deleteMany({
          where: { contributionId: c.id },
        });
        await tx.sessionContribution.delete({ where: { id: c.id } });
        const newContrib = await tx.sessionContribution.create({
          data: {
            sessionId: survivingId,
            personId: c.personId,
            roleDefinitionId: c.roleDefinitionId,
            creditNameOverride: c.creditNameOverride,
            notes: c.notes,
            confidence: c.confidence,
            confidenceSource: c.confidenceSource,
            confirmedAt: c.confirmedAt,
          },
        });
        // Re-create skills on the new contribution
        for (const skill of c.skills) {
          await tx.contributionSkill.create({
            data: {
              contributionId: newContrib.id,
              skillDefinitionId: skill.skillDefinitionId,
              level: skill.level,
              notes: skill.notes,
            },
          });
        }
      }
    }

    // 3. Reassign SetSession rows: absorbed → surviving
    const absorbedSetLinks = await tx.setSession.findMany({
      where: { sessionId: absorbedId },
    });
    for (const link of absorbedSetLinks) {
      const existing = await tx.setSession.findUnique({
        where: { setId_sessionId: { setId: link.setId, sessionId: survivingId } },
      });
      if (existing) {
        // Set is already linked to surviving — just delete the absorbed row
        await tx.setSession.delete({
          where: { setId_sessionId: { setId: link.setId, sessionId: absorbedId } },
        });
      } else {
        // Move the link: delete old + create new (can't update composite PK)
        await tx.setSession.delete({
          where: { setId_sessionId: { setId: link.setId, sessionId: absorbedId } },
        });
        await tx.setSession.create({
          data: {
            setId: link.setId,
            sessionId: survivingId,
            isPrimary: link.isPrimary,
          },
        });
      }
    }

    // 4. Hard-delete remaining absorbed contributions (skills already handled)
    await tx.contributionSkill.deleteMany({
      where: { contribution: { sessionId: absorbedId } },
    });
    await tx.sessionContribution.deleteMany({ where: { sessionId: absorbedId } });

    // 5. Delete absorbed session
    await tx.session.delete({
      where: { id: absorbedId },
    });

    // 6. Rebuild SetParticipant cache for all sets linked to surviving session
    const survivingSetLinks = await tx.setSession.findMany({
      where: { sessionId: survivingId },
      select: { setId: true },
    });
    for (const link of survivingSetLinks) {
      await rebuildSetParticipantsFromContributions(tx, link.setId);
    }
  });
}

export async function linkSessionToSet(
  setId: string,
  sessionId: string,
  isPrimary = false,
) {
  return prisma.$transaction(async (tx) => {
    const link = await tx.setSession.create({
      data: { setId, sessionId, isPrimary },
    });

    // Rebuild SetParticipant cache from contributions (new session may add participants)
    await rebuildSetParticipantsFromContributions(tx, setId);

    return link;
  });
}

export async function unlinkSessionFromSet(setId: string, sessionId: string) {
  // Prevent removing the last/primary link
  const link = await prisma.setSession.findUnique({
    where: { setId_sessionId: { setId, sessionId } },
  });
  if (!link) throw new Error("Link not found");
  if (link.isPrimary) throw new Error("Cannot remove the primary session link");

  const count = await prisma.setSession.count({ where: { setId } });
  if (count <= 1) throw new Error("Cannot remove the last session link");

  return prisma.setSession.delete({
    where: { setId_sessionId: { setId, sessionId } },
  });
}

export async function searchSessions(q: string) {
  if (!q.trim()) return [];
  return prisma.session.findMany({
    where: {
      name: { contains: q.trim(), mode: "insensitive" },
      type: { not: "REFERENCE" as SessionType },
    },
    select: {
      id: true,
      name: true,
      status: true,
      date: true,
      datePrecision: true,
      _count: {
        select: {
          mediaItems: true,
          contributions: true,
          setSessionLinks: true,
        },
      },
    },
    take: 20,
    orderBy: { createdAt: "desc" },
  });
}

export async function getPersonReferenceSession(personId: string) {
  return prisma.session.findFirst({
    where: { personId },
    include: {
      _count: {
        select: { mediaItems: true },
      },
    },
  });
}
