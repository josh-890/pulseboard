import { prisma } from "@/lib/db";
import type { Prisma, SetType, ResolutionStatus } from "@/generated/prisma/client";
import { cascadeDeleteSet } from "./cascade-helpers";
import type { TxClient } from "./cascade-helpers";
import { mergeSessionsRecord } from "./session-service";
import { rebuildSetParticipantsFromContributions } from "./contribution-service";

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
    where.channel = { labelMaps: { some: { labelId } } };
  }

  return prisma.set.findMany({
    where,
    include: {
      channel: {
        include: { labelMaps: { include: { label: true } } },
      },
      participants: {
        include: {
          person: {
            include: {
              aliases: { where: { type: "common" }, take: 1 },
            },
          },
          roleDefinition: { include: { group: true } },
        },
      },
      _count: {
        select: {
          creditsRaw: { where: { resolutionStatus: "UNRESOLVED" } },
        },
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
    where.channel = { labelMaps: { some: { labelId } } };
  }

  const [totalCount, sets] = await Promise.all([
    prisma.set.count({ where }),
    prisma.set.findMany({
      where,
      include: {
        channel: {
          include: { labelMaps: { include: { label: true } } },
        },
        participants: {
          include: {
            person: {
              include: {
                aliases: { where: { type: "common" }, take: 1 },
              },
            },
            roleDefinition: { include: { group: true } },
          },
        },
        _count: {
          select: {
            creditsRaw: { where: { resolutionStatus: "UNRESOLVED" } },
          },
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
      channel: {
        include: { labelMaps: { include: { label: true } } },
      },
      creditsRaw: {
        include: {
          resolvedPerson: {
            include: {
              aliases: { where: { type: "common" }, take: 1 },
            },
          },
          roleDefinition: { include: { group: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      participants: {
        include: {
          person: {
            include: {
              aliases: { where: { type: "common" }, take: 1 },
            },
          },
          roleDefinition: { include: { group: true } },
        },
      },
      labelEvidence: {
        include: { label: true },
        orderBy: { createdAt: "asc" },
      },
      sessionLinks: {
        include: {
          session: {
            select: { id: true, name: true, status: true, date: true, datePrecision: true },
          },
        },
        orderBy: { isPrimary: "desc" },
      },
    },
  });
}

export async function countSets(): Promise<number> {
  return prisma.set.count();
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
  return prisma.$transaction(async (tx) => {
    // Look up channel's primary label via ChannelLabelMap (highest confidence)
    const channelLabel = await tx.channelLabelMap.findFirst({
      where: { channelId: data.channelId },
      orderBy: { confidence: "desc" },
      select: { labelId: true },
    });

    // Create a DRAFT Session seeded from set data
    const session = await tx.session.create({
      data: {
        name: data.title,
        nameNorm: data.title.toLowerCase(),
        status: "DRAFT",
        date: data.releaseDate ? new Date(data.releaseDate) : undefined,
        datePrecision: (data.releaseDatePrecision as "UNKNOWN" | "YEAR" | "MONTH" | "DAY") ?? "UNKNOWN",
        labelId: channelLabel?.labelId ?? undefined,
      },
    });

    // Create the Set
    const set = await tx.set.create({
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

    // Create SetSession link with isPrimary=true
    await tx.setSession.create({
      data: {
        setId: set.id,
        sessionId: session.id,
        isPrimary: true,
      },
    });

    return { setId: set.id, sessionId: session.id };
  });
}

export async function updateSetRecord(id: string, data: {
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
  return prisma.$transaction(async (tx) => {
    await cascadeDeleteSet(tx, id);
  });
}

export async function getChannelsForSelect() {
  const channels = await prisma.channel.findMany({
    include: {
      labelMaps: { include: { label: { select: { id: true, name: true } } } },
    },
    orderBy: { name: "asc" },
  });
  return channels.map((c) => ({
    id: c.id,
    name: c.name,
    labelName: c.labelMaps[0]?.label.name ?? null,
    labelId: c.labelMaps[0]?.label.id ?? null,
  }));
}

export async function getChannelsWithLabelMaps() {
  const channels = await prisma.channel.findMany({
    include: {
      labelMaps: {
        include: { label: { select: { id: true, name: true } } },
      },
    },
    orderBy: { name: "asc" },
  });
  return channels.map((c) => ({
    id: c.id,
    name: c.name,
    labelName: c.labelMaps[0]?.label.name ?? null,
    labelId: c.labelMaps[0]?.label.id ?? null,
    labelMaps: c.labelMaps.map((m) => ({
      labelId: m.labelId,
      labelName: m.label.name,
      confidence: m.confidence,
    })),
  }));
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
            },
          },
        },
      ],
    },
    include: {
      aliases: { where: { type: "common" }, take: 1 },
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
  credits: { roleDefinitionId: string; rawName: string; resolvedPersonId?: string }[],
) {
  if (credits.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const credit of credits) {
      const isResolved = !!credit.resolvedPersonId;
      await tx.setCreditRaw.create({
        data: {
          setId,
          roleDefinitionId: credit.roleDefinitionId,
          rawName: credit.rawName,
          nameNorm: credit.rawName.toLowerCase(),
          resolvedPersonId: credit.resolvedPersonId ?? null,
          resolutionStatus: isResolved ? "RESOLVED" : "UNRESOLVED",
        },
      });

      // If pre-resolved, create SessionContribution on linked sessions
      if (isResolved && credit.resolvedPersonId) {
        const links = await tx.setSession.findMany({
          where: { setId },
          select: { sessionId: true },
        });
        for (const link of links) {
          await tx.sessionContribution.upsert({
            where: {
              sessionId_personId_roleDefinitionId: {
                sessionId: link.sessionId,
                personId: credit.resolvedPersonId,
                roleDefinitionId: credit.roleDefinitionId,
              },
            },
            create: {
              sessionId: link.sessionId,
              personId: credit.resolvedPersonId,
              roleDefinitionId: credit.roleDefinitionId,
            },
            update: {},
          });
        }
      }
    }

    // Rebuild SetParticipant cache from contributions
    await rebuildSetParticipantsFromContributions(tx, setId);
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

    // Create SessionContribution on all linked sessions
    if (credit.roleDefinitionId) {
      const links = await tx.setSession.findMany({
        where: { setId: credit.setId },
        select: { sessionId: true },
      });
      for (const link of links) {
        await tx.sessionContribution.upsert({
          where: {
            sessionId_personId_roleDefinitionId: {
              sessionId: link.sessionId,
              personId,
              roleDefinitionId: credit.roleDefinitionId,
            },
          },
          create: {
            sessionId: link.sessionId,
            personId,
            roleDefinitionId: credit.roleDefinitionId,
          },
          update: {},
        });
      }
    }

    // Rebuild SetParticipant cache
    await rebuildSetParticipantsFromContributions(tx, credit.setId);

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

    // Remove SessionContribution if this was the only credit pointing to that person+role
    if (credit.resolvedPersonId && credit.roleDefinitionId) {
      const otherCredits = await tx.setCreditRaw.count({
        where: {
          setId: credit.setId,
          roleDefinitionId: credit.roleDefinitionId,
          resolvedPersonId: credit.resolvedPersonId,
          resolutionStatus: "RESOLVED",
          id: { not: creditId },
        },
      });

      if (otherCredits === 0) {
        // Remove contributions from linked sessions
        const links = await tx.setSession.findMany({
          where: { setId: credit.setId },
          select: { sessionId: true },
        });
        for (const link of links) {
          // Only remove if no OTHER set linked to this session still contributes this person+role
          const otherSetContrib = await tx.sessionContribution.count({
            where: {
              sessionId: link.sessionId,
              personId: credit.resolvedPersonId!,
              roleDefinitionId: credit.roleDefinitionId!,
              session: {
                setSessionLinks: {
                  some: {
                    set: {
                      id: { not: credit.setId },
                      creditsRaw: {
                        some: {
                          resolvedPersonId: credit.resolvedPersonId,
                          roleDefinitionId: credit.roleDefinitionId,
                          resolutionStatus: "RESOLVED",
                        },
                      },
                    },
                  },
                },
              },
            },
          });
          if (otherSetContrib === 0) {
            // Cascade delete contribution skills first
            await tx.contributionSkill.deleteMany({
              where: {
                contribution: {
                  sessionId: link.sessionId,
                  personId: credit.resolvedPersonId!,
                  roleDefinitionId: credit.roleDefinitionId!,
                },
              },
            });
            await tx.sessionContribution.deleteMany({
              where: {
                sessionId: link.sessionId,
                personId: credit.resolvedPersonId!,
                roleDefinitionId: credit.roleDefinitionId!,
              },
            });
          }
        }
      }
    }

    // Rebuild SetParticipant cache
    await rebuildSetParticipantsFromContributions(tx, credit.setId);

    return tx.setCreditRaw.update({
      where: { id: creditId },
      data: {
        resolutionStatus: "UNRESOLVED" as ResolutionStatus,
        resolvedPersonId: null,
      },
    });
  });
}

// ── Label evidence management ────────────────────────────────────────────────

export async function createManualLabelEvidence(setId: string, labelId: string) {
  return prisma.setLabelEvidence.create({
    data: {
      setId,
      labelId,
      evidenceType: "MANUAL",
      confidence: 1.0,
    },
  });
}

export async function deleteLabelEvidence(
  setId: string,
  labelId: string,
  evidenceType: "CHANNEL_MAP" | "MANUAL",
) {
  return prisma.setLabelEvidence.deleteMany({
    where: { setId, labelId, evidenceType },
  });
}

// ── Recent defaults for quick add ────────────────────────────────────────────

export async function getRecentChannels(limit = 5) {
  const recentSets = await prisma.set.findMany({
    select: { channelId: true },
    orderBy: { createdAt: "desc" },
    take: limit * 3, // fetch more to get distinct
  });

  // Deduplicate while preserving order, skip nulls
  const seen = new Set<string>();
  const channelIds: string[] = [];
  for (const s of recentSets) {
    if (s.channelId && !seen.has(s.channelId)) {
      seen.add(s.channelId);
      channelIds.push(s.channelId);
    }
    if (channelIds.length >= limit) break;
  }

  return channelIds;
}

export async function getLastUsedSetType(): Promise<"photo" | "video" | null> {
  const last = await prisma.set.findFirst({
    select: { type: true },
    orderBy: { createdAt: "desc" },
  });
  return (last?.type as "photo" | "video") ?? null;
}

// ── Smart suggestions for credit resolution ──────────────────────────────────

export async function getSuggestedResolutions(rawName: string, channelId: string | null) {
  // Normalize the name for comparison
  const normalizedName = rawName.toLowerCase().trim();

  // 1. Find previously resolved credits with the same raw name
  const previouslyResolved = await prisma.setCreditRaw.findMany({
    where: {
      rawName: { equals: rawName, mode: "insensitive" },
      resolutionStatus: "RESOLVED",
      resolvedPersonId: { not: null },
    },
    select: {
      resolvedPersonId: true,
      resolvedPerson: {
        select: {
          id: true,
          icgId: true,
          aliases: { where: { type: "common" }, take: 1 },
        },
      },
    },
    distinct: ["resolvedPersonId"],
    take: 5,
  });

  type SuggestionResult = {
    id: string;
    icgId: string;
    commonAlias: string | null;
    source: "previous" | "channel";
  };

  const suggestions: SuggestionResult[] = previouslyResolved
    .filter((c): c is typeof c & { resolvedPerson: NonNullable<typeof c.resolvedPerson> } => c.resolvedPerson !== null)
    .map((c) => ({
      id: c.resolvedPerson.id,
      icgId: c.resolvedPerson.icgId,
      commonAlias: c.resolvedPerson.aliases[0]?.name ?? null,
      source: "previous" as const,
    }));

  const suggestedIds = new Set(suggestions.map((s) => s.id));

  // 2. Find persons frequently appearing in same channel (if channel known)
  if (channelId && suggestions.length < 5) {
    const channelPersons = await prisma.sessionContribution.findMany({
      where: {
        session: {
          setSessionLinks: { some: { set: { channelId } } },
        },
      },
      select: {
        personId: true,
        person: {
          select: {
            id: true,
            icgId: true,
            aliases: { where: { type: "common" }, take: 1 },
          },
        },
      },
      distinct: ["personId"],
      take: 10,
    });

    for (const cp of channelPersons) {
      if (suggestedIds.has(cp.personId)) continue;
      if (suggestions.length >= 5) break;

      // Boost if name is similar
      const alias = cp.person.aliases[0]?.name?.toLowerCase() ?? "";
      if (alias.includes(normalizedName) || normalizedName.includes(alias)) {
        suggestions.push({
          id: cp.person.id,
          icgId: cp.person.icgId,
          commonAlias: cp.person.aliases[0]?.name ?? null,
          source: "channel" as const,
        });
        suggestedIds.add(cp.personId);
      }
    }
  }

  return suggestions;
}

export async function getSetCredits(setId: string) {
  return prisma.setCreditRaw.findMany({
    where: { setId },
    include: {
      resolvedPerson: {
        include: {
          aliases: { where: { type: "common" }, take: 1 },
        },
      },
      roleDefinition: { include: { group: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

// ── Compilation: add/remove existing media + auto-sync session links ────────

export async function addExistingMediaToSet(setId: string, mediaItemIds: string[]) {
  if (mediaItemIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    // Get current max sortOrder
    const maxSort = await tx.setMediaItem.aggregate({
      where: { setId },
      _max: { sortOrder: true },
    });
    const startOrder = (maxSort._max.sortOrder ?? -1) + 1;

    await tx.setMediaItem.createMany({
      data: mediaItemIds.map((mediaItemId, i) => ({
        setId,
        mediaItemId,
        sortOrder: startOrder + i,
      })),
      skipDuplicates: true,
    });

    await syncSetSessionLinks(tx, setId);
  });
}

export async function removeMediaFromSet(setId: string, mediaItemIds: string[]) {
  if (mediaItemIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.setMediaItem.deleteMany({
      where: { setId, mediaItemId: { in: mediaItemIds } },
    });

    await syncSetSessionLinks(tx, setId);
  });
}

async function syncSetSessionLinks(tx: TxClient, setId: string) {
  // Find all unique sessionIds from media items in this set
  const mediaLinks = await tx.setMediaItem.findMany({
    where: { setId },
    select: { mediaItem: { select: { sessionId: true } } },
  });

  const sourceSessionIds = new Set<string>();
  for (const link of mediaLinks) {
    if (link.mediaItem.sessionId) {
      sourceSessionIds.add(link.mediaItem.sessionId);
    }
  }

  // Get existing SetSession links
  const existingLinks = await tx.setSession.findMany({
    where: { setId },
  });

  const existingSessionIds = new Set(existingLinks.map((l) => l.sessionId));

  // Create missing links (non-primary source sessions)
  for (const sessionId of sourceSessionIds) {
    if (!existingSessionIds.has(sessionId)) {
      await tx.setSession.create({
        data: { setId, sessionId, isPrimary: false },
      });
    }
  }

  // Remove links for sessions that no longer contribute media
  // BUT never remove isPrimary links
  for (const existing of existingLinks) {
    if (!existing.isPrimary && !sourceSessionIds.has(existing.sessionId)) {
      await tx.setSession.delete({
        where: { setId_sessionId: { setId, sessionId: existing.sessionId } },
      });
    }
  }
}

export async function reassignSetPrimarySession(
  setId: string,
  targetSessionId: string,
) {
  const primaryLink = await prisma.setSession.findFirst({
    where: { setId, isPrimary: true },
  });
  if (!primaryLink) throw new Error("No primary session found for this set");
  if (primaryLink.sessionId === targetSessionId) {
    throw new Error("Target session is already the primary session");
  }

  // Merge the auto-created primary session into the target
  await mergeSessionsRecord(targetSessionId, primaryLink.sessionId);
}
