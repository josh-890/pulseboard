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
  // Filter to sets whose channel is mapped to any of these label IDs.
  // Channels relate to Labels via the ChannelLabelMap join (M:M).
  labelIds?: string[];
  sort?: CareerSort;
};

// ─── Row shape ───────────────────────────────────────────────────────────

// Co-participants on a set, excluding the person whose career page is
// being viewed. Surfaced on the row as a 3rd line when non-empty.
//   - Solo sets (no other participants) → empty array; the row hides
//     the 3rd line.
//   - Up to MAX_VISIBLE_PARTICIPANTS names; remainder summarised by
//     `extraParticipantCount`.
export type CareerRowParticipant = {
  personId: string;
  commonAlias: string;
};

// Sample thumbnail surfaced on a promoted-photo row's right side. Borrows
// the SessionThumbnail shape from the Production Photos pattern: URL plus
// natural dimensions so the row can size each tile by aspect ratio.
export type CareerRowSampleThumbnail = {
  mediaItemId: string;
  url: string;
  width: number;
  height: number;
};

const MAX_SAMPLE_THUMBNAILS = 4;

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
  participants: CareerRowParticipant[];
  extraParticipantCount: number;
  // Up to 4 sample thumbnails. Populated for promoted photo sets only —
  // promoted videos and staged sets carry an empty array (the row's
  // 60×80 cover already represents the set).
  sampleThumbnails: CareerRowSampleThumbnail[];
};

const MAX_VISIBLE_PARTICIPANTS = 5;

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
  if (filters.labelIds && filters.labelIds.length > 0) {
    whereSet.channel = {
      labelMaps: { some: { labelId: { in: filters.labelIds } } },
    };
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

  // Step 4: co-participants per set (excluding this person). Reads the
  // SetParticipant denormalised cache; one batched query covers every
  // set in the view. Iteration order matches insertion order, so the
  // visible 5 are stable across renders.
  const participantsBySetId = await fetchParticipantsForSets(setIds, personId);

  // Step 5: sample thumbnails for photo sets (up to MAX_SAMPLE_THUMBNAILS
  // per set). Promoted videos and staged sets render with the cover only.
  const photoSetIds = sets.filter((s) => s.type === "photo").map((s) => s.id);
  const sampleThumbsBySetId = await fetchSampleThumbsForSets(photoSetIds);

  return sets.map((s) => {
    const participantInfo = participantsBySetId.get(s.id) ?? {
      participants: [],
      extraParticipantCount: 0,
    };
    return {
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
      participants: participantInfo.participants,
      extraParticipantCount: participantInfo.extraParticipantCount,
      sampleThumbnails: sampleThumbsBySetId.get(s.id) ?? [],
    };
  });
}

// Batched sample-thumbnail fetch. Walks SetMediaItem ordered by sortOrder
// for the supplied setIds and groups in JS, keeping the first
// MAX_SAMPLE_THUMBNAILS items per set. URLs are resolved from the
// gallery_512 variant when present, falling back to the original then the
// raw fileRef — same pattern the (deleted) hover-preview service used.
async function fetchSampleThumbsForSets(
  setIds: string[],
): Promise<Map<string, CareerRowSampleThumbnail[]>> {
  if (setIds.length === 0) return new Map();
  const rows = await prisma.setMediaItem.findMany({
    where: { setId: { in: setIds } },
    orderBy: [{ setId: "asc" }, { sortOrder: "asc" }],
    select: {
      setId: true,
      mediaItem: {
        select: {
          id: true,
          variants: true,
          fileRef: true,
          originalWidth: true,
          originalHeight: true,
        },
      },
    },
  });

  const map = new Map<string, CareerRowSampleThumbnail[]>();
  for (const row of rows) {
    const existing = map.get(row.setId) ?? [];
    if (existing.length >= MAX_SAMPLE_THUMBNAILS) continue;
    const variants = (row.mediaItem.variants ?? {}) as PhotoVariants;
    const url = variants.gallery_512
      ? buildUrl(variants.gallery_512)
      : variants.original
        ? buildUrl(variants.original)
        : row.mediaItem.fileRef
          ? buildUrl(row.mediaItem.fileRef)
          : null;
    if (!url) continue;
    existing.push({
      mediaItemId: row.mediaItem.id,
      url,
      width: row.mediaItem.originalWidth,
      height: row.mediaItem.originalHeight,
    });
    map.set(row.setId, existing);
  }
  return map;
}

// Batched fetch: for each setId, returns the up-to-5 co-participants
// (excluding the viewer) plus the overflow count. Single SetParticipant
// findMany covers the entire timeline.
type ParticipantsForSet = {
  participants: CareerRowParticipant[];
  extraParticipantCount: number;
};

async function fetchParticipantsForSets(
  setIds: string[],
  excludePersonId: string,
): Promise<Map<string, ParticipantsForSet>> {
  if (setIds.length === 0) return new Map();
  const rows = await prisma.setParticipant.findMany({
    where: { setId: { in: setIds }, personId: { not: excludePersonId } },
    select: {
      setId: true,
      person: {
        select: {
          id: true,
          icgId: true,
          aliases: {
            where: { isCommon: true },
            select: { name: true },
            take: 1,
          },
        },
      },
    },
  });

  // Group by setId; preserve order from the query.
  const grouped = new Map<string, CareerRowParticipant[]>();
  for (const r of rows) {
    const arr = grouped.get(r.setId) ?? [];
    arr.push({
      personId: r.person.id,
      commonAlias: r.person.aliases[0]?.name ?? r.person.icgId,
    });
    grouped.set(r.setId, arr);
  }

  // Cap visible + count overflow.
  const result = new Map<string, ParticipantsForSet>();
  for (const [setId, all] of grouped) {
    result.set(setId, {
      participants: all.slice(0, MAX_VISIBLE_PARTICIPANTS),
      extraParticipantCount: Math.max(0, all.length - MAX_VISIBLE_PARTICIPANTS),
    });
  }
  return result;
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
  if (filters.labelIds && filters.labelIds.length > 0) {
    whereStaging.channel = {
      labelMaps: { some: { labelId: { in: filters.labelIds } } },
    };
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
      participantIcgIds: true,
      archiveLinks: {
        where: { status: "CONFIRMED" },
        select: { archiveStatus: true },
        take: 1,
      },
    },
  });

  // Resolve all co-participant ICG IDs (excluding the viewer) to Person
  // rows with their common alias. One batched query covers the whole
  // timeline; the viewer's own ICG is excluded before the lookup.
  const allOtherIcgIds = Array.from(
    new Set(
      stagingSets.flatMap((s) =>
        s.participantIcgIds.filter((icg) => icg !== person.icgId),
      ),
    ),
  );
  const resolvedPersons =
    allOtherIcgIds.length > 0
      ? await prisma.person.findMany({
          where: { icgId: { in: allOtherIcgIds } },
          select: {
            id: true,
            icgId: true,
            aliases: {
              where: { isCommon: true },
              select: { name: true },
              take: 1,
            },
          },
        })
      : [];
  const personByIcg = new Map<string, { personId: string; commonAlias: string }>();
  for (const p of resolvedPersons) {
    personByIcg.set(p.icgId, {
      personId: p.id,
      commonAlias: p.aliases[0]?.name ?? p.icgId,
    });
  }

  return stagingSets.map((s) => {
    const otherIcgs = s.participantIcgIds.filter((icg) => icg !== person.icgId);
    const resolved: CareerRowParticipant[] = otherIcgs
      .map((icg) => personByIcg.get(icg))
      .filter((p): p is { personId: string; commonAlias: string } => p !== undefined);
    const visible = resolved.slice(0, MAX_VISIBLE_PARTICIPANTS);
    const overflow = Math.max(0, resolved.length - MAX_VISIBLE_PARTICIPANTS);
    return {
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
      participants: visible,
      extraParticipantCount: overflow,
      sampleThumbnails: [],
    };
  });
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

// ─── Career stats (claimed vs promoted vs staged) ──────────────────────────

export type CareerStatTriple = { photos: number; videos: number; covers: number };

// Claimed figures parsed from the biography (covers is derived); promoted =
// distinct Sets credited to the person by type; staged = active-pipeline
// staging sets matched to the person, dedup'd against existing Sets so a
// staged shoot that would merge into a promoted Set isn't double-counted.
export type CareerStats = {
  claimed: {
    photosets: number | null;
    videos: number | null;
    covers: number | null;
    note: string | null;
  };
  promoted: CareerStatTriple;
  staged: CareerStatTriple;
};

// Statuses that count as "in the pipeline toward complete". PROMOTED rows are
// already counted as promoted; SKIPPED / INACTIVE are out of the pipeline.
const STAGED_PIPELINE_STATUSES = ["PENDING", "REVIEWING", "APPROVED"] as const;

export async function getCareerStats(personId: string): Promise<CareerStats> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: {
      icgId: true,
      claimedPhotosets: true,
      claimedVideos: true,
      claimedStatsNote: true,
    },
  });

  const claimedPhotosets = person?.claimedPhotosets ?? null;
  const claimedVideos = person?.claimedVideos ?? null;
  const claimedCovers =
    claimedPhotosets === null && claimedVideos === null
      ? null
      : (claimedPhotosets ?? 0) + (claimedVideos ?? 0);

  const icgId = person?.icgId ?? null;

  // One grouped count per source instead of one per (source × type). Both group
  // queries are index-driven: SessionContribution.personId + SetSession.sessionId
  // for promoted; the participantIcgIds GIN index for staged.
  const [promotedGroups, stagedGroups] = await Promise.all([
    // Distinct Sets credited to the person (same reach as getPromotedRowsForPerson).
    prisma.set.groupBy({
      by: ["type"],
      where: {
        sessionLinks: { some: { session: { contributions: { some: { personId } } } } },
      },
      _count: true,
    }),
    // Active-pipeline staged sets we actually hold: dedup'd against existing Sets
    // (matchedSetId null) and gated on a CONFIRMED archive link (folder on disk).
    icgId
      ? prisma.stagingSet.groupBy({
          by: ["isVideo"],
          where: {
            matchedSetId: null,
            status: { in: [...STAGED_PIPELINE_STATUSES] },
            participantIcgIds: { has: icgId },
            archiveLinks: { some: { status: "CONFIRMED" } },
          },
          _count: true,
        })
      : Promise.resolve([] as { isVideo: boolean; _count: number }[]),
  ]);

  const promPhotos = promotedGroups.find((g) => g.type === "photo")?._count ?? 0;
  const promVideos = promotedGroups.find((g) => g.type === "video")?._count ?? 0;
  const stagedPhotos = stagedGroups.find((g) => !g.isVideo)?._count ?? 0;
  const stagedVideos = stagedGroups.find((g) => g.isVideo)?._count ?? 0;

  return {
    claimed: {
      photosets: claimedPhotosets,
      videos: claimedVideos,
      covers: claimedCovers,
      note: person?.claimedStatsNote ?? null,
    },
    promoted: { photos: promPhotos, videos: promVideos, covers: promPhotos + promVideos },
    staged: { photos: stagedPhotos, videos: stagedVideos, covers: stagedPhotos + stagedVideos },
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

