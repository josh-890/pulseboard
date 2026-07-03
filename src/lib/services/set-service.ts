import { prisma } from "@/lib/db";
import { ArchiveLinkStatus } from "@/generated/prisma/client";
import type { Prisma, SetType, ResolutionStatus } from "@/generated/prisma/client";
import { normalizeForSearch } from "@/lib/normalize";
import { cascadeDeleteSet } from "./cascade-helpers";
import type { TxClient } from "./cascade-helpers";
import { mergeSessionsRecord } from "./session-service";
import { rebuildSetParticipantsFromContributions } from "./contribution-service";
import { refreshPersonAffiliations } from "./view-service";
import { contributorKindForRoleGroup } from "./session-contributors";

export type SetSort =
  | "date-desc"
  | "date-asc"
  | "title-asc"
  | "title-desc"
  | "newest"
  | "media-desc"
  | "updated"
  | "rating-desc"
  | "rating-asc";

export type SetFilters = {
  q?: string;
  type?: SetType | "all";
  labelId?: string;
  channelId?: string;
  personId?: string;
  hasMedia?: boolean;
  sort?: SetSort;
  archiveFilter?: 'noArchive' | 'verified' | 'changed' | 'missing' | 'notImported'
  noArchiveLink?: boolean
  ids?: string[]
  // Multi-select star rating, same shape as PersonFilters.ratings.
  // Numeric values 1..5 select Sets rated exactly that many stars;
  // "unrated" selects Sets with rating IS NULL.
  ratings?: (number | "unrated")[];
  releaseDateFrom?: Date;
  releaseDateTo?: Date;
  createdFrom?: Date;
  createdTo?: Date;
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
      channel: {
        include: { label: true, labelMaps: { include: { label: true } } },
      },
      coherenceSnapshot: {
        select: { hasMediaInApp: true },
      },
      archiveLinks: {
        where: { status: ArchiveLinkStatus.CONFIRMED },
        select: {
          id: true,
          archiveStatus: true,
          archiveFileCount: true,
          archiveFolder: { select: { id: true, folderName: true, fullPath: true } },
        },
        take: 1,
      },
      participants: {
        include: {
          person: {
            include: {
              aliases: { where: { isCommon: true }, take: 1 },
            },
          },
          roleDefinition: { include: { group: true } },
        },
      },
      creditsRaw: {
        where: { resolvedArtistId: { not: null } },
        select: { resolvedArtistId: true, resolvedArtist: { select: { id: true, name: true } } },
      },
      sessionLinks: {
        where: { isPrimary: true },
        select: { session: { select: { date: true, datePrecision: true, dateIsConfirmed: true } } },
        take: 1,
      },
      _count: {
        select: {
          creditsRaw: { where: { resolutionStatus: "UNRESOLVED" } },
          setMediaItems: true,
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

function getSetOrderBy(sort?: SetSort): Prisma.SetOrderByWithRelationInput[] {
  switch (sort) {
    case "date-asc":
      return [{ releaseDate: { sort: "asc", nulls: "last" } }];
    case "title-asc":
      return [{ titleNorm: "asc" }];
    case "title-desc":
      return [{ titleNorm: "desc" }];
    case "newest":
      return [{ createdAt: "desc" }];
    case "media-desc":
      return [{ setMediaItems: { _count: "desc" } }];
    case "updated":
      return [{ updatedAt: "desc" }];
    case "rating-desc":
      return [{ rating: { sort: "desc", nulls: "last" } }];
    case "rating-asc":
      return [{ rating: { sort: "asc", nulls: "last" } }];
    case "date-desc":
    default:
      return [{ releaseDate: { sort: "desc", nulls: "last" } }];
  }
}

export async function getSetsPaginated(
  filters: SetFilters = {},
  cursor?: string,
  limit = 50,
): Promise<PaginatedSets> {
  const { q, type, labelId, channelId, personId, hasMedia, sort, archiveFilter, noArchiveLink, ids, ratings, releaseDateFrom, releaseDateTo, createdFrom, createdTo } = filters;

  const where: Prisma.SetWhereInput = {};

  if (ids && ids.length > 0) {
    where.id = { in: ids };
  }

  // Multi-select rating: same shape as PersonFilters. Numeric buckets
  // select exact-match ratings; "unrated" sentinel selects NULL.
  if (ratings && ratings.length > 0) {
    const nums = ratings.filter((r): r is number => typeof r === "number");
    const includesUnrated = ratings.includes("unrated");
    const clauses: Prisma.SetWhereInput[] = [];
    if (nums.length > 0) clauses.push({ rating: { in: nums } });
    if (includesUnrated) clauses.push({ rating: null });
    if (clauses.length === 1) Object.assign(where, clauses[0]);
    else if (clauses.length > 1) where.OR = [...(where.OR ?? []), ...clauses];
  }

  if (type && type !== "all") {
    where.type = type;
  }

  if (q) {
    where.title = { contains: q, mode: "insensitive" };
  }

  if (labelId) {
    where.channel = { labelId };
  }

  if (channelId) {
    where.channelId = channelId;
  }

  if (personId) {
    where.participants = { some: { personId } };
  }

  if (releaseDateFrom || releaseDateTo) {
    where.releaseDate = {
      ...(releaseDateFrom ? { gte: releaseDateFrom } : {}),
      ...(releaseDateTo ? { lte: releaseDateTo } : {}),
    };
  }

  if (createdFrom || createdTo) {
    where.createdAt = {
      ...(createdFrom ? { gte: createdFrom } : {}),
      ...(createdTo ? { lte: createdTo } : {}),
    };
  }

  const confirmed = ArchiveLinkStatus.CONFIRMED
  if (archiveFilter === 'noArchive' || noArchiveLink === true) {
    // No CONFIRMED archive link
    where.archiveLinks = { none: { status: confirmed } }
  } else if (archiveFilter === 'verified') {
    where.archiveLinks = { some: { status: confirmed, archiveStatus: 'OK' } }
  } else if (archiveFilter === 'changed') {
    where.archiveLinks = { some: { status: confirmed, archiveStatus: 'CHANGED' } }
  } else if (archiveFilter === 'missing') {
    where.archiveLinks = { some: { status: confirmed, archiveStatus: 'MISSING' } }
  } else if (archiveFilter === 'notImported') {
    where.archiveLinks = { some: { status: confirmed } }
    where.coherenceSnapshot = { hasMediaInApp: false }
  }

  if (hasMedia === true) {
    where.setMediaItems = { some: {} };
  }

  const orderBy = getSetOrderBy(sort);

  const [totalCount, sets] = await Promise.all([
    prisma.set.count({ where }),
    prisma.set.findMany({
      where,
      include: {
        channel: {
          include: { label: true, labelMaps: { include: { label: true } } },
        },
        coherenceSnapshot: {
          select: { hasMediaInApp: true },
        },
        archiveLinks: {
          where: { status: ArchiveLinkStatus.CONFIRMED },
          select: {
            id: true,
            archiveStatus: true,
            archiveFileCount: true,
            archiveFolder: { select: { id: true, folderName: true, fullPath: true } },
          },
          take: 1,
        },
        participants: {
          include: {
            person: {
              include: {
                aliases: { where: { isCommon: true }, take: 1 },
              },
            },
            roleDefinition: { include: { group: true } },
          },
        },
        creditsRaw: {
          where: { resolvedArtistId: { not: null } },
          select: { resolvedArtistId: true, resolvedArtist: { select: { id: true, name: true } } },
        },
        sessionLinks: {
          where: { isPrimary: true },
          select: { session: { select: { date: true, datePrecision: true, dateIsConfirmed: true } } },
          take: 1,
        },
        _count: {
          select: {
            creditsRaw: { where: { resolutionStatus: "UNRESOLVED" } },
            setMediaItems: true,
          },
        },
      },
      orderBy,
      take: limit + 1,
      skip: cursor ? parseInt(cursor, 10) : 0,
    }),
  ]);

  const offset = cursor ? parseInt(cursor, 10) : 0;
  const hasMore = sets.length > limit;
  const items = hasMore ? sets.slice(0, limit) : sets;
  const nextCursor = hasMore ? String(offset + limit) : null;

  return { items, nextCursor, totalCount };
}

/**
 * Resolve each Set participant's linked Era (ADR-0004) by joining through
 * SetSession → SessionContribution. A SetParticipant is a derived cache and
 * intentionally has no eraId of its own — the source of truth is the
 * SessionContribution.
 *
 * Returns a Map keyed by personId:
 *  - eraLabel        : the era label IF the person has a single distinct
 *                      non-null eraId across every linked-session contribution
 *  - isBaseline      : true if that single era is the baseline
 *  - eraCount        : number of distinct non-null eras across the linked
 *                      sessions (0 = none, 1 = consistent, >1 = compilation
 *                      ambiguity — no snapshot shown)
 */
export type SetParticipantEraInfo = {
  eraLabel: string | null;
  isBaseline: boolean;
  eraCount: number;
};

export async function getSetParticipantEraMap(
  setId: string,
): Promise<Map<string, SetParticipantEraInfo>> {
  // Resolve via linked sessions in two hops; keeping the include tree shallow
  // to stay well under Prisma's recursive-type budget (cf. Phase F).
  const sessionLinks = await prisma.setSession.findMany({
    where: { setId },
    select: { sessionId: true },
  });
  const sessionIds = sessionLinks.map((l) => l.sessionId);
  if (sessionIds.length === 0) return new Map();

  const contributions = await prisma.sessionContribution.findMany({
    where: { sessionId: { in: sessionIds }, eraId: { not: null } },
    select: {
      personId: true,
      era: { select: { id: true, label: true, isBaseline: true } },
    },
  });

  // Group distinct eras per person.
  type Bucket = { eras: Map<string, { label: string; isBaseline: boolean }> };
  const byPerson = new Map<string, Bucket>();
  for (const c of contributions) {
    if (!c.era) continue;
    const bucket = byPerson.get(c.personId) ?? { eras: new Map() };
    bucket.eras.set(c.era.id, { label: c.era.label, isBaseline: c.era.isBaseline });
    byPerson.set(c.personId, bucket);
  }

  const result = new Map<string, SetParticipantEraInfo>();
  for (const [personId, bucket] of byPerson) {
    const distinctCount = bucket.eras.size;
    if (distinctCount === 1) {
      const only = bucket.eras.values().next().value!;
      result.set(personId, {
        eraLabel: only.label,
        isBaseline: only.isBaseline,
        eraCount: 1,
      });
    } else {
      result.set(personId, {
        eraLabel: null,
        isBaseline: false,
        eraCount: distinctCount,
      });
    }
  }
  return result;
}

export async function getSetById(id: string) {
  return prisma.set.findUnique({
    where: { id },
    include: {
      channel: {
        include: { label: true, labelMaps: { include: { label: true } } },
      },
      creditsRaw: {
        include: {
          resolvedPerson: {
            include: {
              aliases: { where: { isCommon: true }, take: 1 },
            },
          },
          resolvedAlias: { select: { id: true, name: true } },
          resolvedArtist: true,
          roleDefinition: { include: { group: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      participants: {
        include: {
          person: {
            include: {
              aliases: { where: { isCommon: true }, take: 1 },
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
            select: { id: true, name: true, status: true, date: true, datePrecision: true, dateIsConfirmed: true },
          },
        },
        orderBy: { isPrimary: "desc" },
      },
      archiveLinks: {
        where: { status: ArchiveLinkStatus.CONFIRMED },
        select: {
          id: true,
          archivePath: true,
          archiveStatus: true,
          archiveLastChecked: true,
          archiveFileCount: true,
          archiveFileCountPrev: true,
          archiveVideoPresent: true,
          archiveVideoFiles: true,
          archiveVideoFilename: true,
          archiveFolder: { select: { id: true, folderName: true, fullPath: true } },
        },
        take: 1,
      },
    },
  });
}

export async function countSets(): Promise<number> {
  return prisma.set.count();
}

export type SetFacetCounts = {
  type: Record<string, number>;
  channelId: Record<string, number>;
  labelId: Record<string, number>;
  // Keyed by "1".."5" (numeric buckets) + "unrated" for null. Each
  // count excludes the rating filter from its own selection so users
  // see the effect of toggling a bucket.
  rating: Record<string, number>;
};

export async function getSetFacetCounts(
  filters: Omit<SetFilters, "sort">,
  labelIds: string[] = [],
): Promise<SetFacetCounts> {
  function buildBase(overrides: Partial<Pick<SetFilters, "type" | "channelId" | "labelId" | "ratings">> = {}): Prisma.SetWhereInput {
    const merged = { ...filters, ...overrides };
    const w: Prisma.SetWhereInput = {};
    if (filters.ids && filters.ids.length > 0) w.id = { in: filters.ids };
    if (merged.type && merged.type !== "all") w.type = merged.type;
    if (filters.q) w.title = { contains: filters.q, mode: "insensitive" };
    if (merged.channelId) w.channelId = merged.channelId;
    if (merged.labelId) w.channel = { labelId: merged.labelId };
    if (filters.personId) w.participants = { some: { personId: filters.personId } };
    if (filters.hasMedia) w.setMediaItems = { some: {} };
    if (filters.noArchiveLink) w.archiveLinks = { none: { status: ArchiveLinkStatus.CONFIRMED } };
    if (merged.ratings && merged.ratings.length > 0) {
      const nums = merged.ratings.filter((r): r is number => typeof r === "number");
      const includesUnrated = merged.ratings.includes("unrated");
      const clauses: Prisma.SetWhereInput[] = [];
      if (nums.length > 0) clauses.push({ rating: { in: nums } });
      if (includesUnrated) clauses.push({ rating: null });
      if (clauses.length === 1) Object.assign(w, clauses[0]);
      else if (clauses.length > 1) w.OR = [...(w.OR ?? []), ...clauses];
    }
    if (filters.releaseDateFrom || filters.releaseDateTo) {
      w.releaseDate = {
        ...(filters.releaseDateFrom ? { gte: filters.releaseDateFrom } : {}),
        ...(filters.releaseDateTo ? { lte: filters.releaseDateTo } : {}),
      };
    }
    if (filters.createdFrom || filters.createdTo) {
      w.createdAt = {
        ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
        ...(filters.createdTo ? { lte: filters.createdTo } : {}),
      };
    }
    return w;
  }

  const [typeGroups, channelGroups, ratingGroups, ...labelCounts] = await Promise.all([
    prisma.set.groupBy({ by: ["type"], where: buildBase({ type: undefined }), _count: { _all: true } }),
    prisma.set.groupBy({ by: ["channelId"], where: buildBase({ channelId: undefined }), _count: { _all: true } }),
    prisma.set.groupBy({ by: ["rating"], where: buildBase({ ratings: undefined }), _count: { _all: true } }),
    ...labelIds.map((id) =>
      prisma.set.count({ where: { ...buildBase({ labelId: undefined }), channel: { labelId: id } } })
        .then((count) => [id, count] as [string, number]),
    ),
  ]);

  return {
    type: Object.fromEntries(typeGroups.map((r) => [r.type, r._count._all])),
    channelId: Object.fromEntries(channelGroups.filter((r) => r.channelId).map((r) => [r.channelId!, r._count._all])),
    labelId: Object.fromEntries((labelCounts as [string, number][]).filter(Boolean)),
    rating: Object.fromEntries(
      ratingGroups.map((r) => [r.rating === null ? "unrated" : String(r.rating), r._count._all]),
    ),
  };
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
  isCompilation?: boolean;
  isComplete?: boolean;
  imageCount?: number;
  videoLength?: string;
  externalId?: string;
}) {
  const result = await prisma.$transaction(async (tx) => {
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
        nameNorm: normalizeForSearch(data.title),
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
        titleNorm: normalizeForSearch(data.title),
        channelId: data.channelId,
        description: data.description,
        notes: data.notes,
        releaseDate: data.releaseDate ? new Date(data.releaseDate) : undefined,
        releaseDatePrecision: (data.releaseDatePrecision as "UNKNOWN" | "YEAR" | "MONTH" | "DAY") ?? "UNKNOWN",
        category: data.category,
        genre: data.genre,
        tags: data.tags ?? [],
        isCompilation: data.isCompilation ?? false,
        isComplete: data.isComplete ?? false,
        imageCount: data.imageCount ?? null,
        videoLength: data.videoLength ?? null,
        externalId: data.externalId ?? null,
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

  // Fire-and-forget: update staging set matches for this title+channel
  import('@/lib/services/import/match-refresh-service').then(
    ({ refreshMatchesForTitle }) =>
      refreshMatchesForTitle(data.title, data.channelId).catch(() => {}),
  );

  return result;
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
  isCompilation?: boolean;
  isComplete?: boolean;
  imageCount?: number | null;
  videoLength?: string | null;
  externalId?: string | null;
}) {
  const setData = {
    title: data.title,
    titleNorm: data.title ? normalizeForSearch(data.title) : undefined,
    channelId: data.channelId,
    description: data.description,
    notes: data.notes,
    releaseDate: data.releaseDate ? new Date(data.releaseDate) : data.releaseDate === null ? null : undefined,
    releaseDatePrecision: (data.releaseDatePrecision as "UNKNOWN" | "YEAR" | "MONTH" | "DAY") ?? undefined,
    category: data.category,
    genre: data.genre,
    tags: data.tags,
    isCompilation: data.isCompilation,
    isComplete: data.isComplete,
    imageCount: data.imageCount,
    videoLength: data.videoLength === "" ? null : data.videoLength,
    externalId: data.externalId === "" ? null : data.externalId,
  };

  const releaseDateChanging = data.releaseDate !== undefined;
  const needsTransaction = data.channelId !== undefined || releaseDateChanging;

  // Simple update — no side effects
  if (!needsTransaction) {
    return prisma.set.update({ where: { id }, data: setData });
  }

  // Wrap in transaction to cascade side effects
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.set.update({ where: { id }, data: setData });

    // Find the primary session (needed for both channel-label and date sync)
    const primaryLink = await tx.setSession.findFirst({
      where: { setId: id, isPrimary: true },
      select: { sessionId: true, session: { select: { dateIsConfirmed: true } } },
    });

    // For both cascades below, we only touch the session when it belongs exclusively to this set
    const sessionIsExclusive =
      primaryLink != null &&
      (await tx.setSession.count({ where: { sessionId: primaryLink.sessionId } })) === 1;

    // When channel changes — cascade label to primary session
    if (data.channelId && sessionIsExclusive) {
      const newChannelMap = await tx.channelLabelMap.findFirst({
        where: { channelId: data.channelId },
        orderBy: { confidence: "desc" },
        select: { labelId: true },
      });
      if (newChannelMap?.labelId) {
        await tx.session.update({
          where: { id: primaryLink!.sessionId },
          data: { labelId: newChannelMap.labelId },
        });
      }
    }

    // When releaseDate changes — sync primary session date if not confirmed
    // (session date was seeded from release date and is just a copy)
    if (releaseDateChanging && sessionIsExclusive && !primaryLink!.session.dateIsConfirmed) {
      await tx.session.update({
        where: { id: primaryLink!.sessionId },
        data: {
          date: data.releaseDate ? new Date(data.releaseDate) : null,
          datePrecision: (data.releaseDatePrecision as "UNKNOWN" | "YEAR" | "MONTH" | "DAY") ?? "UNKNOWN",
        },
      });
    }

    return updated;
  });

  // Refresh materialized view outside the transaction
  await refreshPersonAffiliations();
  return result;
}

export async function deleteSetRecord(id: string) {
  return prisma.$transaction(async (tx) => {
    await cascadeDeleteSet(tx, id);
  });
}

export async function getChannelsForSelect() {
  const channels = await prisma.channel.findMany({
    include: {
      label: { select: { id: true, name: true } }, // owning Label (ADR-0020 FK)
    },
    orderBy: { name: "asc" },
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
      label: { select: { id: true, name: true } }, // owning Label (ADR-0020 FK)
      labelMaps: {
        include: { label: { select: { id: true, name: true } } },
      },
    },
    orderBy: { name: "asc" },
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

export async function searchPersonsForSelect(q: string) {
  const qLower = q.toLowerCase();
  const persons = await prisma.person.findMany({
    where: {
      OR: [
        { icgId: { contains: q, mode: "insensitive" } },
        {
          aliases: {
            some: {
              name: { contains: q, mode: "insensitive" },
            },
          },
        },
      ],
    },
    include: {
      aliases: {
        where: {
          OR: [
            { isCommon: true },
            { name: { contains: q, mode: "insensitive" } },
          ],
        },
      },
    },
    take: 20,
    orderBy: { createdAt: "asc" },
  });
  return persons.map((p) => {
    const common = p.aliases.find((a) => a.isCommon);
    const commonName = common?.name ?? null;
    // Show a.k.a. only when the common name doesn't match the query
    const commonMatches = commonName?.toLowerCase().includes(qLower) || p.icgId.toLowerCase().includes(qLower);
    const matchedAliases = commonMatches
      ? []
      : p.aliases
          .filter((a) => !a.isCommon && a.name.toLowerCase().includes(qLower))
          .map((a) => a.name);
    return {
      id: p.id,
      icgId: p.icgId,
      commonAlias: commonName,
      matchedAlias: matchedAliases.length > 0 ? matchedAliases.join(", ") : null,
    };
  });
}

// ── SetCreditRaw / SetParticipant operations ────────────────────────────────

export async function createSetCreditsRaw(
  setId: string,
  credits: { roleDefinitionId: string; rawName: string; resolvedPersonId?: string; resolvedArtistId?: string }[],
) {
  if (credits.length === 0) return;

  await prisma.$transaction(async (tx) => {
    // Fetch session links once for the entire set (avoids N+1 per credit)
    const sessionLinks = await tx.setSession.findMany({
      where: { setId },
      select: { sessionId: true },
    });

    for (const credit of credits) {
      const isResolvedPerson = !!credit.resolvedPersonId;
      const isResolvedArtist = !!credit.resolvedArtistId;
      const isResolved = isResolvedPerson || isResolvedArtist;
      await tx.setCreditRaw.create({
        data: {
          setId,
          roleDefinitionId: credit.roleDefinitionId,
          rawName: credit.rawName,
          nameNorm: normalizeForSearch(credit.rawName),
          resolvedPersonId: credit.resolvedPersonId ?? null,
          resolvedArtistId: credit.resolvedArtistId ?? null,
          resolutionStatus: isResolved ? "RESOLVED" : "UNRESOLVED",
        },
      });

      // If pre-resolved as person, create SessionContribution on linked sessions
      // Artists bypass the contribution chain entirely
      if (isResolvedPerson && credit.resolvedPersonId) {
        for (const link of sessionLinks) {
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
              confidence: "CONFIRMED",
              confidenceSource: "CREDIT_MATCH",
              confirmedAt: new Date(),
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

/**
 * Set the alias a person was credited under on this set (ADR-0024) — the manual
 * per-set "Credited as" editor for promoted sets. Writes `SetCreditRaw.rawName`
 * (the display evidence) and auto-pins `resolvedAliasId` when a registered alias
 * on the set's channel matches; clears the pin otherwise. An empty value resets
 * to the common name (no "as" line). The used-name then surfaces in the person's
 * "Suggested from sets" queue for promotion into the registry.
 */
export async function setCreditUsedName(creditId: string, usedName: string) {
  const credit = await prisma.setCreditRaw.findUnique({
    where: { id: creditId },
    select: {
      resolvedPersonId: true,
      set: { select: { channelId: true } },
      resolvedPerson: {
        select: { aliases: { where: { isCommon: true }, select: { name: true }, take: 1 } },
      },
    },
  });
  if (!credit) throw new Error("Credit not found");

  const commonName = credit.resolvedPerson?.aliases[0]?.name ?? null;
  const trimmed = usedName.trim();
  // Empty → reset to the common name (suppresses the "as" line).
  const effective = trimmed || commonName || "";
  const nameNorm = normalizeForSearch(effective);
  const commonNorm = commonName ? normalizeForSearch(commonName) : null;

  // Auto-pin to an existing alias on this channel when the used-name matches one.
  let resolvedAliasId: string | null = null;
  if (credit.resolvedPersonId && credit.set?.channelId && nameNorm && nameNorm !== commonNorm) {
    const alias = await prisma.personAlias.findFirst({
      where: {
        personId: credit.resolvedPersonId,
        nameNorm,
        channelLinks: { some: { channelId: credit.set.channelId } },
      },
      select: { id: true },
    });
    resolvedAliasId = alias?.id ?? null;
  }

  await prisma.setCreditRaw.update({
    where: { id: creditId },
    data: { rawName: effective, nameNorm, resolvedAliasId },
  });
}

/**
 * Pin an existing registered alias as the credited name on this set (ADR-0024).
 * Sets both rawName (display evidence) and resolvedAliasId (the registry pin).
 */
export async function pinCreditAlias(creditId: string, aliasId: string) {
  const alias = await prisma.personAlias.findUniqueOrThrow({
    where: { id: aliasId },
    select: { name: true },
  });
  await prisma.setCreditRaw.update({
    where: { id: creditId },
    data: { rawName: alias.name, nameNorm: normalizeForSearch(alias.name), resolvedAliasId: aliasId },
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

export async function resolveCreditRaw(
  creditId: string,
  personId: string,
): Promise<{ suggestNewAlias: boolean; rawName: string }> {
  return prisma.$transaction(async (tx) => {
    // ADR-0021: behind-camera credits resolve to an Artist, never a Person.
    const before = await tx.setCreditRaw.findUniqueOrThrow({
      where: { id: creditId },
      select: { roleDefinition: { select: { group: { select: { name: true } } } } },
    });
    if (before.roleDefinition && contributorKindForRoleGroup(before.roleDefinition.group.name) === "artist") {
      throw new Error("Behind-camera credits resolve to an Artist, not a Person (ADR-0021).");
    }

    const credit = await tx.setCreditRaw.update({
      where: { id: creditId },
      data: {
        resolutionStatus: "RESOLVED" as ResolutionStatus,
        resolvedPersonId: personId,
      },
    });

    // Auto-match rawName against the person's known aliases
    const rawNameNorm = normalizeForSearch(credit.rawName);
    const matchingAlias = await tx.personAlias.findFirst({
      where: { personId, nameNorm: rawNameNorm },
      select: { id: true },
    });

    let suggestNewAlias = false;
    if (matchingAlias) {
      await tx.setCreditRaw.update({
        where: { id: creditId },
        data: { resolvedAliasId: matchingAlias.id },
      });
    } else {
      suggestNewAlias = true;
    }

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
            creditNameOverride: credit.rawName,
            confidence: "CONFIRMED",
            confidenceSource: "CREDIT_MATCH",
            confirmedAt: new Date(),
            resolvedAliasId: matchingAlias?.id ?? null,
          },
          update: {},
        });
      }
    }

    // Rebuild SetParticipant cache
    await rebuildSetParticipantsFromContributions(tx, credit.setId);

    return { suggestNewAlias, rawName: credit.rawName };
  });
}

export async function ignoreCreditRaw(creditId: string) {
  return prisma.setCreditRaw.update({
    where: { id: creditId },
    data: { resolutionStatus: "IGNORED" as ResolutionStatus },
  });
}

export async function resolveCreditAsArtistRaw(creditId: string, artistId: string) {
  // ADR-0021: on-camera credits resolve to a Person, never an Artist.
  const before = await prisma.setCreditRaw.findUniqueOrThrow({
    where: { id: creditId },
    select: { roleDefinition: { select: { group: { select: { name: true } } } } },
  });
  if (before.roleDefinition && contributorKindForRoleGroup(before.roleDefinition.group.name) === "person") {
    throw new Error("On-camera credits resolve to a Person, not an Artist (ADR-0021).");
  }
  return prisma.setCreditRaw.update({
    where: { id: creditId },
    data: {
      resolutionStatus: "RESOLVED" as ResolutionStatus,
      resolvedArtistId: artistId,
      resolvedPersonId: null,
    },
  });
}

export async function unresolveCreditRaw(creditId: string) {
  return prisma.$transaction(async (tx) => {
    const credit = await tx.setCreditRaw.findUniqueOrThrow({ where: { id: creditId } });

    // Artist credits: just clear the field, no contribution cleanup needed
    if (credit.resolvedArtistId) {
      return tx.setCreditRaw.update({
        where: { id: creditId },
        data: {
          resolutionStatus: "UNRESOLVED" as ResolutionStatus,
          resolvedArtistId: null,
        },
      });
    }

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
        resolvedArtistId: null,
      },
    });
  });
}

export async function deleteCreditRaw(creditId: string) {
  const credit = await prisma.setCreditRaw.findUniqueOrThrow({ where: { id: creditId } });
  if (credit.resolutionStatus === "RESOLVED") {
    // Unresolve first to clean up contributions, then delete
    await unresolveCreditRaw(creditId);
  }
  await prisma.setCreditRaw.delete({ where: { id: creditId } });
  return credit.setId;
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
  const normalizedName = rawName.toLowerCase().trim();

  type SuggestionResult = {
    id: string;
    icgId: string;
    commonAlias: string | null;
    source: "alias_channel" | "previous" | "channel";
  };

  const suggestions: SuggestionResult[] = [];
  const suggestedIds = new Set<string>();

  // 1. Highest priority: persons who have a known alias matching rawName on this channel
  if (channelId) {
    const aliasChannelMatches = await prisma.personAliasChannel.findMany({
      where: {
        channelId,
        alias: { name: { contains: rawName, mode: "insensitive" } },
      },
      select: {
        alias: {
          select: {
            name: true,
            person: {
              select: {
                id: true,
                icgId: true,
                aliases: { where: { isCommon: true }, take: 1 },
              },
            },
          },
        },
      },
      take: 5,
    });

    for (const m of aliasChannelMatches) {
      if (suggestedIds.has(m.alias.person.id)) continue;
      suggestions.push({
        id: m.alias.person.id,
        icgId: m.alias.person.icgId,
        commonAlias: m.alias.person.aliases[0]?.name ?? null,
        source: "alias_channel",
      });
      suggestedIds.add(m.alias.person.id);
    }
  }

  // 2. Previously resolved credits with the same raw name
  if (suggestions.length < 5) {
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
            aliases: { where: { isCommon: true }, take: 1 },
          },
        },
      },
      distinct: ["resolvedPersonId"],
      take: 5,
    });

    for (const c of previouslyResolved) {
      if (!c.resolvedPerson || suggestedIds.has(c.resolvedPerson.id)) continue;
      if (suggestions.length >= 5) break;
      suggestions.push({
        id: c.resolvedPerson.id,
        icgId: c.resolvedPerson.icgId,
        commonAlias: c.resolvedPerson.aliases[0]?.name ?? null,
        source: "previous",
      });
      suggestedIds.add(c.resolvedPerson.id);
    }
  }

  // 3. Persons frequently appearing in same channel with similar name
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
            aliases: { where: { isCommon: true }, take: 1 },
          },
        },
      },
      distinct: ["personId"],
      take: 10,
    });

    for (const cp of channelPersons) {
      if (suggestedIds.has(cp.personId)) continue;
      if (suggestions.length >= 5) break;

      const alias = cp.person.aliases[0]?.name?.toLowerCase() ?? "";
      if (alias.includes(normalizedName) || normalizedName.includes(alias)) {
        suggestions.push({
          id: cp.person.id,
          icgId: cp.person.icgId,
          commonAlias: cp.person.aliases[0]?.name ?? null,
          source: "channel",
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
          aliases: { where: { isCommon: true }, take: 1 },
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

export async function splitMediaToSession(
  setId: string,
  mediaItemIds: string[],
  targetSessionId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.mediaItem.updateMany({
      where: { id: { in: mediaItemIds } },
      data: { sessionId: targetSessionId },
    });
    await syncSetSessionLinks(tx, setId);
  });
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
