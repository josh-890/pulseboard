// Career-tab data layer.
//
// Produces a unified per-Set timeline for a person, merging promoted Sets
// (canonical entities) and staged StagingSets (workflow intermediates) into
// a single chronological list with a discriminated-union row shape. Cover
// URLs are filled via the shared `getCoverPhotosForSets` helper to avoid
// nested Prisma include trees (which collapse type inference per the
// `feedback_*` memory on Prisma type-recursion budget). Sample thumbnails
// + participant avatars are fetched on demand by the hover-preview popover
// (`get*HoverPreview`) to keep the timeline payload light at scale.

import { prisma } from "@/lib/db";
import type {
  ArchiveStatus,
  SetType,
  Prisma,
} from "@/generated/prisma/client";
import { getCoverPhotosForSets } from "@/lib/services/media-service";
import { buildUrl } from "@/lib/media-url";
import type { PhotoVariants } from "@/lib/types/photo";

// ─── Filter spec ─────────────────────────────────────────────────────────

export type CareerArchiveStatusBucket =
  | "linked"
  | "unlinked"
  | "missing"
  | "changed";

export type CareerSort =
  | "date-desc"
  | "date-asc"
  | "rating-desc"
  | "rating-asc";

export type CareerTimelineFilters = {
  type?: SetType; // "photo" | "video" — when undefined, both included
  channelIds?: string[];
  ratings?: (number | "unrated")[];
  eraIds?: string[];
  archiveStatuses?: CareerArchiveStatusBucket[];
  sort?: CareerSort;
};

// ─── Row shape ───────────────────────────────────────────────────────────

type CareerTimelineRowBase = {
  title: string;
  releaseDate: Date | null;
  releaseDatePrecision: string;
  channelId: string | null;
  channelName: string | null;
  type: SetType;
  coverUrl: string | null;
  archiveStatus: ArchiveStatus | null;
  hasArchiveLink: boolean;
  itemCount: number | null;
  eraId: string | null;
};

export type CareerTimelineRow =
  | (CareerTimelineRowBase & {
      kind: "promoted";
      setId: string;
      rating: number | null;
    })
  | (CareerTimelineRowBase & {
      kind: "staged";
      stagingSetId: string;
      externalId: string | null;
      rating: null;
    });

// ─── Promoted: per-Set query ─────────────────────────────────────────────

async function getPromotedRowsForPerson(
  personId: string,
  filters: CareerTimelineFilters,
): Promise<CareerTimelineRow[]> {
  const whereSet: Prisma.SetWhereInput = {
    sessionLinks: {
      some: {
        session: {
          contributions: {
            some:
              filters.eraIds && filters.eraIds.length > 0
                ? { personId, eraId: { in: filters.eraIds } }
                : { personId },
          },
        },
      },
    },
  };

  if (filters.type) whereSet.type = filters.type;
  if (filters.channelIds && filters.channelIds.length > 0) {
    whereSet.channelId = { in: filters.channelIds };
  }
  if (filters.ratings && filters.ratings.length > 0) {
    const nums = filters.ratings.filter((r): r is number => typeof r === "number");
    const includesUnrated = filters.ratings.includes("unrated");
    const clauses: Prisma.SetWhereInput[] = [];
    if (nums.length > 0) clauses.push({ rating: { in: nums } });
    if (includesUnrated) clauses.push({ rating: null });
    if (clauses.length === 1) Object.assign(whereSet, clauses[0]);
    else if (clauses.length > 1) whereSet.OR = clauses;
  }
  if (filters.archiveStatuses && filters.archiveStatuses.length > 0) {
    const archiveClauses: Prisma.SetWhereInput[] = [];
    if (filters.archiveStatuses.includes("linked")) {
      archiveClauses.push({ archiveLinks: { some: { status: "CONFIRMED" } } });
    }
    if (filters.archiveStatuses.includes("unlinked")) {
      archiveClauses.push({ archiveLinks: { none: { status: "CONFIRMED" } } });
    }
    if (filters.archiveStatuses.includes("missing")) {
      archiveClauses.push({
        archiveLinks: { some: { status: "CONFIRMED", archiveStatus: "MISSING" } },
      });
    }
    if (filters.archiveStatuses.includes("changed")) {
      archiveClauses.push({
        archiveLinks: { some: { status: "CONFIRMED", archiveStatus: "CHANGED" } },
      });
    }
    if (archiveClauses.length > 0) {
      whereSet.OR = [...(whereSet.OR ?? []), ...archiveClauses];
    }
  }

  // Step 1: flat scalar query (no nested variant include — avoids type
  // recursion). Era is looked up via a secondary query below.
  const sets = await prisma.set.findMany({
    where: whereSet,
    select: {
      id: true,
      title: true,
      type: true,
      releaseDate: true,
      releaseDatePrecision: true,
      imageCount: true,
      rating: true,
      channelId: true,
      channel: { select: { name: true } },
      archiveLinks: {
        where: { status: "CONFIRMED" },
        select: { archiveStatus: true },
        take: 1,
      },
    },
  });

  if (sets.length === 0) return [];

  const setIds = sets.map((s) => s.id);

  // Step 2: covers via the shared helper (handles explicit + fallback).
  const coverMap = await getCoverPhotosForSets(setIds);

  // Step 3: era per set — for each set's primary session, look up this
  // person's contribution eraId. Single query.
  const contributionRows = await prisma.sessionContribution.findMany({
    where: {
      personId,
      session: { setSessionLinks: { some: { setId: { in: setIds }, isPrimary: true } } },
    },
    select: {
      eraId: true,
      session: {
        select: {
          setSessionLinks: {
            where: { isPrimary: true, setId: { in: setIds } },
            select: { setId: true },
          },
        },
      },
    },
  });
  const eraBySetId = new Map<string, string | null>();
  for (const c of contributionRows) {
    for (const ss of c.session.setSessionLinks) {
      if (!eraBySetId.has(ss.setId)) eraBySetId.set(ss.setId, c.eraId);
    }
  }

  return sets.map((s) => ({
    kind: "promoted" as const,
    setId: s.id,
    title: s.title,
    type: s.type,
    releaseDate: s.releaseDate,
    releaseDatePrecision: s.releaseDatePrecision,
    channelId: s.channelId,
    channelName: s.channel?.name ?? null,
    itemCount: s.imageCount ?? null,
    rating: s.rating,
    coverUrl: coverMap.get(s.id)?.url ?? null,
    archiveStatus: s.archiveLinks[0]?.archiveStatus ?? null,
    hasArchiveLink: !!s.archiveLinks[0],
    eraId: eraBySetId.get(s.id) ?? null,
  }));
}

// ─── Staged: per-StagingSet query ────────────────────────────────────────

async function getStagedRowsForPerson(
  personId: string,
  filters: CareerTimelineFilters,
): Promise<CareerTimelineRow[]> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { icgId: true },
  });
  if (!person) return [];

  const whereStaging: Prisma.StagingSetWhereInput = {
    participantIcgIds: { has: person.icgId },
    status: "APPROVED",
  };

  if (filters.type === "photo") whereStaging.isVideo = false;
  else if (filters.type === "video") whereStaging.isVideo = true;

  if (filters.channelIds && filters.channelIds.length > 0) {
    whereStaging.channelId = { in: filters.channelIds };
  }

  // Rating filter: staged sets have no rating. They effectively belong to
  // the "unrated" bucket — include only when "unrated" is among picks
  // (or when no rating filter is active).
  if (filters.ratings && filters.ratings.length > 0) {
    if (!filters.ratings.includes("unrated")) return [];
  }

  // Era filter: staged sets are not era-bound. Exclude when era filter is active.
  if (filters.eraIds && filters.eraIds.length > 0) return [];

  if (filters.archiveStatuses && filters.archiveStatuses.length > 0) {
    const archiveClauses: Prisma.StagingSetWhereInput[] = [];
    if (filters.archiveStatuses.includes("linked")) {
      archiveClauses.push({ archiveLinks: { some: { status: "CONFIRMED" } } });
    }
    if (filters.archiveStatuses.includes("unlinked")) {
      archiveClauses.push({ archiveLinks: { none: { status: "CONFIRMED" } } });
    }
    if (filters.archiveStatuses.includes("missing")) {
      archiveClauses.push({
        archiveLinks: { some: { status: "CONFIRMED", archiveStatus: "MISSING" } },
      });
    }
    if (filters.archiveStatuses.includes("changed")) {
      archiveClauses.push({
        archiveLinks: { some: { status: "CONFIRMED", archiveStatus: "CHANGED" } },
      });
    }
    if (archiveClauses.length > 0) {
      whereStaging.OR = [...(whereStaging.OR ?? []), ...archiveClauses];
    }
  }

  const stagingSets = await prisma.stagingSet.findMany({
    where: whereStaging,
    select: {
      id: true,
      title: true,
      channelName: true,
      channelId: true,
      releaseDate: true,
      releaseDatePrecision: true,
      isVideo: true,
      externalId: true,
      coverImageUrl: true,
      imageCount: true,
      archiveLinks: {
        where: { status: "CONFIRMED" },
        select: { archiveStatus: true },
        take: 1,
      },
    },
  });

  return stagingSets.map((s) => ({
    kind: "staged" as const,
    stagingSetId: s.id,
    title: s.title,
    type: s.isVideo ? ("video" as const) : ("photo" as const),
    releaseDate: s.releaseDate,
    releaseDatePrecision: s.releaseDatePrecision,
    channelId: s.channelId,
    channelName: s.channelName,
    externalId: s.externalId,
    itemCount: s.imageCount ?? null,
    rating: null,
    coverUrl: s.coverImageUrl,
    archiveStatus: s.archiveLinks[0]?.archiveStatus ?? null,
    hasArchiveLink: !!s.archiveLinks[0],
    eraId: null,
  }));
}

// ─── Unified merge ────────────────────────────────────────────────────────

export async function getCareerTimeline(
  personId: string,
  filters: CareerTimelineFilters = {},
): Promise<CareerTimelineRow[]> {
  const [promoted, staged] = await Promise.all([
    getPromotedRowsForPerson(personId, filters),
    getStagedRowsForPerson(personId, filters),
  ]);
  return sortRows([...promoted, ...staged], filters.sort ?? "date-desc");
}

function sortRows(rows: CareerTimelineRow[], sort: CareerSort): CareerTimelineRow[] {
  const dateValue = (r: CareerTimelineRow): number =>
    r.releaseDate?.getTime() ?? -Infinity;
  const ratingValue = (r: CareerTimelineRow): number => r.rating ?? -Infinity;
  const sorted = [...rows];
  switch (sort) {
    case "date-asc":
      sorted.sort((a, b) => dateValue(a) - dateValue(b));
      break;
    case "rating-desc":
      sorted.sort((a, b) => {
        const r = ratingValue(b) - ratingValue(a);
        return r !== 0 ? r : dateValue(b) - dateValue(a);
      });
      break;
    case "rating-asc":
      sorted.sort((a, b) => {
        const r = ratingValue(a) - ratingValue(b);
        return r !== 0 ? r : dateValue(b) - dateValue(a);
      });
      break;
    case "date-desc":
    default:
      sorted.sort((a, b) => dateValue(b) - dateValue(a));
  }
  return sorted;
}

// ─── Facet counts ─────────────────────────────────────────────────────────

export type CareerFacetCounts = {
  channel: Record<string, number>;
  rating: Record<string, number>;
  era: Record<string, number>;
  archiveStatus: Record<string, number>;
};

export async function getCareerFacetCounts(
  personId: string,
  filters: CareerTimelineFilters = {},
): Promise<CareerFacetCounts> {
  // Each facet's count: re-run the timeline query with that facet's filter
  // removed, then bucket. O(facets × timeline-size); acceptable for ≤ 1000
  // rows / person.
  const [channelRows, ratingRows, eraRows, archiveRows] = await Promise.all([
    getCareerTimeline(personId, { ...filters, channelIds: undefined }),
    getCareerTimeline(personId, { ...filters, ratings: undefined }),
    getCareerTimeline(personId, { ...filters, eraIds: undefined }),
    getCareerTimeline(personId, { ...filters, archiveStatuses: undefined }),
  ]);

  const channelCounts: Record<string, number> = {};
  for (const r of channelRows) {
    if (r.channelId) channelCounts[r.channelId] = (channelCounts[r.channelId] ?? 0) + 1;
  }
  const ratingCounts: Record<string, number> = {};
  for (const r of ratingRows) {
    const key = r.rating === null ? "unrated" : String(r.rating);
    ratingCounts[key] = (ratingCounts[key] ?? 0) + 1;
  }
  const eraCounts: Record<string, number> = {};
  for (const r of eraRows) {
    if (r.eraId) eraCounts[r.eraId] = (eraCounts[r.eraId] ?? 0) + 1;
  }
  const archiveCounts: Record<string, number> = {};
  for (const r of archiveRows) {
    if (!r.hasArchiveLink) archiveCounts.unlinked = (archiveCounts.unlinked ?? 0) + 1;
    else if (r.archiveStatus === "MISSING") archiveCounts.missing = (archiveCounts.missing ?? 0) + 1;
    else if (r.archiveStatus === "CHANGED") archiveCounts.changed = (archiveCounts.changed ?? 0) + 1;
    else archiveCounts.linked = (archiveCounts.linked ?? 0) + 1;
  }

  return {
    channel: channelCounts,
    rating: ratingCounts,
    era: eraCounts,
    archiveStatus: archiveCounts,
  };
}

// ─── Hover preview ───────────────────────────────────────────────────────

export type CareerHoverParticipant = {
  personId: string;
  commonAlias: string | null;
  icgId: string;
};

export type CareerHoverPreviewData = {
  coverUrl: string | null;
  sampleThumbnails: { url: string; mediaItemId: string }[];
  participants: CareerHoverParticipant[];
};

export async function getPromotedHoverPreview(
  setId: string,
): Promise<CareerHoverPreviewData | null> {
  // Fetch base set + cover via the shared helper (handles explicit + fallback).
  const [coverMap, mediaLinks, participantRows] = await Promise.all([
    getCoverPhotosForSets([setId]),
    prisma.setMediaItem.findMany({
      where: { setId },
      orderBy: { sortOrder: "asc" },
      take: 6,
      select: {
        mediaItem: { select: { id: true, variants: true, fileRef: true } },
      },
    }),
    prisma.setParticipant.findMany({
      where: { setId },
      select: {
        person: {
          select: {
            id: true,
            icgId: true,
            aliases: { where: { isCommon: true }, select: { name: true }, take: 1 },
          },
        },
      },
    }),
  ]);

  return {
    coverUrl: coverMap.get(setId)?.url ?? null,
    sampleThumbnails: mediaLinks
      .map((m) => {
        const variants = (m.mediaItem.variants ?? {}) as PhotoVariants;
        const url = variants.gallery_512
          ? buildUrl(variants.gallery_512)
          : variants.original
            ? buildUrl(variants.original)
            : m.mediaItem.fileRef
              ? buildUrl(m.mediaItem.fileRef)
              : null;
        return url ? { url, mediaItemId: m.mediaItem.id } : null;
      })
      .filter((x): x is { url: string; mediaItemId: string } => x !== null),
    participants: participantRows.map((p) => ({
      personId: p.person.id,
      icgId: p.person.icgId,
      commonAlias: p.person.aliases[0]?.name ?? null,
    })),
  };
}

// ─── Filter option lists ─────────────────────────────────────────────────

// Distinct channels for the person across promoted + staged sets. Used
// to populate the channel filter dropdown. Returns both id and name —
// staging sets without a resolved channelId are excluded.
export async function getCareerChannelsForPerson(
  personId: string,
): Promise<{ id: string; name: string }[]> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { icgId: true },
  });
  if (!person) return [];

  const [promotedChannels, stagedChannels] = await Promise.all([
    prisma.set.findMany({
      where: {
        sessionLinks: {
          some: { session: { contributions: { some: { personId } } } },
        },
        channelId: { not: null },
      },
      select: { channelId: true, channel: { select: { name: true } } },
      distinct: ["channelId"],
    }),
    prisma.stagingSet.findMany({
      where: {
        participantIcgIds: { has: person.icgId },
        status: "APPROVED",
        channelId: { not: null },
      },
      select: { channelId: true, channelName: true },
      distinct: ["channelId"],
    }),
  ]);

  const map = new Map<string, string>();
  for (const c of promotedChannels) {
    if (c.channelId && c.channel?.name) map.set(c.channelId, c.channel.name);
  }
  for (const c of stagedChannels) {
    if (c.channelId && !map.has(c.channelId)) {
      map.set(c.channelId, c.channelName);
    }
  }
  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Eras associated with the person's promoted sets. Staged sets are not
// era-bound today, so this is promoted-only.
export async function getCareerErasForPerson(
  personId: string,
): Promise<{ id: string; label: string }[]> {
  const contributionRows = await prisma.sessionContribution.findMany({
    where: { personId, eraId: { not: null } },
    select: {
      era: { select: { id: true, label: true } },
    },
  });
  const map = new Map<string, string>();
  for (const c of contributionRows) {
    if (c.era) map.set(c.era.id, c.era.label ?? c.era.id);
  }
  return Array.from(map.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function getStagedHoverPreview(
  stagingSetId: string,
): Promise<CareerHoverPreviewData | null> {
  const s = await prisma.stagingSet.findUnique({
    where: { id: stagingSetId },
    select: { coverImageUrl: true, participantIcgIds: true },
  });
  if (!s) return null;

  const participants =
    s.participantIcgIds.length > 0
      ? await prisma.person.findMany({
          where: { icgId: { in: s.participantIcgIds } },
          select: {
            id: true,
            icgId: true,
            aliases: { where: { isCommon: true }, select: { name: true }, take: 1 },
          },
        })
      : [];

  return {
    coverUrl: s.coverImageUrl,
    sampleThumbnails: [],
    participants: participants.map((p) => ({
      personId: p.id,
      icgId: p.icgId,
      commonAlias: p.aliases[0]?.name ?? null,
    })),
  };
}
