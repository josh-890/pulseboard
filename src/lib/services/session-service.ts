import { prisma } from "@/lib/db";
import type { Prisma, SessionStatus } from "@/generated/prisma/client";
import { cascadeDeleteSession } from "./cascade-helpers";

const personSelect = {
  select: {
    id: true,
    icgId: true,
    aliases: { where: { type: "common" as const, deletedAt: null }, take: 1 },
  },
} as const;

export type SessionFilters = {
  q?: string;
  status?: SessionStatus | "all";
  labelId?: string;
  projectId?: string;
};

export async function getSessions(filters: SessionFilters = {}) {
  const { q, status, labelId, projectId } = filters;

  const where: Prisma.SessionWhereInput = {};

  if (status && status !== "all") {
    where.status = status;
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
      participants: {
        include: {
          person: {
            include: {
              aliases: { where: { type: "common", deletedAt: null }, take: 1 },
            },
          },
        },
      },
      _count: {
        select: {
          mediaItems: { where: { deletedAt: null } },
          setSessionLinks: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSessionById(id: string) {
  return prisma.session.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      label: { select: { id: true, name: true } },
      person: personSelect,
      participants: {
        include: {
          person: {
            include: {
              aliases: { where: { type: "common", deletedAt: null }, take: 1 },
            },
          },
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
          mediaItems: { where: { deletedAt: null } },
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
      nameNorm: data.name.toLowerCase(),
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
  // Guard: prevent status changes to/from REFERENCE
  if (data.status) {
    const existing = await prisma.session.findFirst({ where: { id }, select: { status: true } });
    if (existing?.status === "REFERENCE" && data.status !== "REFERENCE") {
      throw new Error("Cannot change status of a reference session");
    }
    if (existing?.status !== "REFERENCE" && data.status === "REFERENCE") {
      throw new Error("Cannot set status to REFERENCE — reference sessions are auto-created");
    }
  }

  return prisma.session.update({
    where: { id },
    data: {
      name: data.name,
      nameNorm: data.name ? data.name.toLowerCase() : undefined,
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
}

export async function deleteSessionRecord(id: string) {
  // Guard: prevent manual deletion of REFERENCE sessions
  const session = await prisma.session.findFirst({ where: { id }, select: { status: true } });
  if (session?.status === "REFERENCE") {
    throw new Error("Reference sessions can only be deleted by deleting the associated person");
  }

  const deletedAt = new Date();
  return prisma.$transaction(async (tx) => {
    await cascadeDeleteSession(tx, id, deletedAt);
  });
}

export async function mergeSessionsRecord(survivingId: string, absorbedId: string) {
  return prisma.$transaction(async (tx) => {
    // Guard: reference sessions cannot be merged
    const [surviving, absorbed] = await Promise.all([
      tx.session.findFirst({ where: { id: survivingId }, select: { status: true } }),
      tx.session.findFirst({ where: { id: absorbedId }, select: { status: true } }),
    ]);
    if (surviving?.status === "REFERENCE" || absorbed?.status === "REFERENCE") {
      throw new Error("Reference sessions cannot be merged");
    }

    // 1. Reassign MediaItems from absorbed → surviving
    await tx.mediaItem.updateMany({
      where: { sessionId: absorbedId, deletedAt: null },
      data: { sessionId: survivingId },
    });

    // 2. Merge SessionParticipants (upsert to avoid dupes)
    const absorbedParticipants = await tx.sessionParticipant.findMany({
      where: { sessionId: absorbedId },
    });
    for (const p of absorbedParticipants) {
      await tx.sessionParticipant.upsert({
        where: {
          sessionId_personId_role: {
            sessionId: survivingId,
            personId: p.personId,
            role: p.role,
          },
        },
        create: {
          sessionId: survivingId,
          personId: p.personId,
          role: p.role,
          creditNameOverride: p.creditNameOverride,
        },
        update: {},
      });
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

    // 4. Hard-delete absorbed participants
    await tx.sessionParticipant.deleteMany({ where: { sessionId: absorbedId } });

    // 5. Soft-delete absorbed session
    await tx.session.update({
      where: { id: absorbedId },
      data: { deletedAt: new Date() },
    });
  });
}

export async function linkSessionToSet(
  setId: string,
  sessionId: string,
  isPrimary = false,
) {
  return prisma.setSession.create({
    data: { setId, sessionId, isPrimary },
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
      status: { not: "REFERENCE" as SessionStatus },
    },
    select: {
      id: true,
      name: true,
      status: true,
      date: true,
      datePrecision: true,
      _count: {
        select: {
          mediaItems: { where: { deletedAt: null } },
          participants: true,
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
        select: { mediaItems: { where: { deletedAt: null } } },
      },
    },
  });
}
