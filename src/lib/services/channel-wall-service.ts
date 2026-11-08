import { Prisma } from "@/generated/prisma/client";
import type { StagingSetStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { localMediaUrlOrNull } from "@/lib/media-url";
import { getCoverPhotosForSets } from "./media-service";
import { identifyCast, type CastIdentity } from "./contact-service";
import { LEAD_ROLE } from "./session-contributors";

// A channel's whole output (2026-11-08): your sets, its open staged sets and the
// catalogue's sets of it (by its import aliases — the only link, ADR-0038 C1),
// one entry per CoverId. What the Sets tab's wall and the Models tab are built of.

export type ChannelWallKind = "set" | "staged" | "catalogue";

export type ChannelWallRow = {
  /** CoverId when known, else the row's own id — one entry per set of the channel */
  key: string;
  kind: ChannelWallKind;
  /** Where the tile opens; catalogue-only sets have no page */
  href: string | null;
  title: string;
  releaseDate: Date | null;
  isVideo: boolean;
  coverUrl: string | null;
  coverFocalX: number | null;
  coverFocalY: number | null;
  rating: number | null;
  /** Staged sets: where they are in the pipeline */
  status: StagingSetStatus | null;
  /** ICG-IDs of the cast, to name them and to count the Models tab */
  castIcgIds: string[];
  /** Names when the row carries them (sets: leads; staged: the import file's) */
  castNames: string[];
};

export type ChannelWall = {
  rows: ChannelWallRow[];
  counts: { set: number; staged: number; catalogue: number };
};

type StagedParticipant = { name?: string; icgId?: string };

const OPEN_OR_SKIPPED: StagingSetStatus[] = ["PENDING", "REVIEWING", "APPROVED", "SKIPPED"];

const upperTrim = (s: string) => s.trim().toUpperCase();

/**
 * Everything known of the channel: your sets first, then staged sets not yet
 * promoted, then catalogue sets neither of those holds. `scope: "library"` stops
 * after your sets.
 */
export async function getChannelWall(channelId: string, scope: "library" | "all"): Promise<ChannelWall> {
  const channel = await prisma.channel.findUniqueOrThrow({
    where: { id: channelId },
    select: { name: true, tier: true, importAliases: true },
  });
  // Staging Sets narrowed to this channel (its own tier: the default tier filter
  // would hide a Low/Trash channel), on the set's status, with the set selected
  const stagedHref = (id: string, isVideo: boolean, status: StagingSetStatus) =>
    `/staging-sets?${new URLSearchParams({
      status,
      channelId,
      channelLabel: channel.name,
      channelTier: channel.tier,
      type: isVideo ? "video" : "photo",
      select: id,
    }).toString()}`;

  const sets = await prisma.set.findMany({
    where: { channelId },
    select: {
      id: true,
      title: true,
      releaseDate: true,
      type: true,
      rating: true,
      externalId: true,
      participants: {
        where: { roleDefinition: LEAD_ROLE },
        select: { person: { select: { icgId: true, aliases: { where: { isCommon: true }, take: 1, select: { name: true } } } } },
      },
    },
  });
  const covers = await getCoverPhotosForSets(sets.map((s) => s.id));
  const rows: ChannelWallRow[] = sets.map((s) => {
    const cover = covers.get(s.id);
    return {
      key: s.externalId ?? `set:${s.id}`,
      kind: "set",
      href: `/sets/${s.id}`,
      title: s.title,
      releaseDate: s.releaseDate,
      isVideo: s.type === "video",
      coverUrl: cover?.url ?? null,
      coverFocalX: cover?.focalX ?? null,
      coverFocalY: cover?.focalY ?? null,
      rating: s.rating,
      status: null,
      castIcgIds: s.participants.map((p) => p.person.icgId),
      castNames: s.participants.map((p) => p.person.aliases[0]?.name ?? p.person.icgId),
    };
  });
  const counts = { set: rows.length, staged: 0, catalogue: 0 };
  if (scope === "library") return { rows, counts };

  const seen = new Set(rows.map((r) => r.key));
  const staged = await prisma.stagingSet.findMany({
    where: { channelId, status: { in: OPEN_OR_SKIPPED } },
    // The furthest along wins when one set was staged twice
    orderBy: [{ status: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      releaseDate: true,
      isVideo: true,
      externalId: true,
      status: true,
      coverImageUrl: true,
      participantIcgIds: true,
      participants: true,
    },
  });
  for (const s of staged) {
    const key = s.externalId ?? `stg:${s.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const people = Array.isArray(s.participants) ? (s.participants as StagedParticipant[]) : [];
    rows.push({
      key,
      kind: "staged",
      href: stagedHref(s.id, s.isVideo, s.status),
      title: s.title,
      releaseDate: s.releaseDate,
      isVideo: s.isVideo,
      coverUrl: localMediaUrlOrNull(s.coverImageUrl),
      coverFocalX: null,
      coverFocalY: null,
      rating: null,
      status: s.status,
      castIcgIds: s.participantIcgIds,
      castNames: people.map((p) => p.name ?? p.icgId ?? "").filter(Boolean),
    });
    counts.staged++;
  }

  const aliases = [...new Set(channel.importAliases.map(upperTrim))];
  if (aliases.length > 0) {
    // Uses catalogue_set_channel_upper_idx
    const catalogue = await prisma.$queryRaw<
      { coverId: string; date: Date | null; title: string; isVideo: boolean; castIcgIds: string[] }[]
    >(Prisma.sql`
      SELECT "coverId", date, title, "isVideo", "castIcgIds" FROM catalogue_set
      WHERE upper(trim("channelName")) = ANY(${aliases}::text[])
    `);
    // A catalogue set staged under another channel still is not "catalogue only"
    const stagedElsewhere = new Set(
      (
        await prisma.stagingSet.findMany({
          where: { externalId: { in: catalogue.map((c) => c.coverId).filter((id) => !seen.has(id)) } },
          select: { externalId: true },
        })
      ).map((s) => s.externalId),
    );
    for (const c of catalogue) {
      if (seen.has(c.coverId) || stagedElsewhere.has(c.coverId)) continue;
      seen.add(c.coverId);
      rows.push({
        key: c.coverId,
        kind: "catalogue",
        href: null,
        title: c.title,
        releaseDate: c.date,
        isVideo: c.isVideo,
        coverUrl: null,
        coverFocalX: null,
        coverFocalY: null,
        rating: null,
        status: null,
        castIcgIds: c.castIcgIds,
        castNames: [],
      });
      counts.catalogue++;
    }
    // Name the catalogue casts from who the app knows them as (Person, else Contact)
    const catalogueRows = rows.filter((r) => r.kind === "catalogue");
    if (catalogueRows.length > 0) {
      const who = await identifyCast(catalogueRows.flatMap((r) => r.castIcgIds));
      for (const r of catalogueRows) r.castNames = r.castIcgIds.map((icgId) => who[icgId]?.name ?? icgId);
    }
  }
  return { rows, counts };
}

export type ChannelModel = CastIdentity & {
  /** Its sets you have */
  inLibrary: number;
  /** All its sets known to the app (yours, staged, catalogue) */
  known: number;
};

/**
 * Everyone seen on the channel, by how many of its sets — developed Persons
 * first, then Contacts (ADR-0038: recognisable, not developed), then the rest.
 */
export async function getChannelModels(wall: ChannelWall): Promise<ChannelModel[]> {
  const tally = new Map<string, { inLibrary: number; known: number }>();
  for (const row of wall.rows) {
    for (const icgId of new Set(row.castIcgIds)) {
      const t = tally.get(icgId) ?? { inLibrary: 0, known: 0 };
      t.known++;
      if (row.kind === "set") t.inLibrary++;
      tally.set(icgId, t);
    }
  }
  const who = await identifyCast([...tally.keys()]);
  const rank: Record<CastIdentity["kind"], number> = { person: 0, contact: 1, unknown: 2 };
  return [...tally.entries()]
    .map(([icgId, t]) => ({ ...(who[icgId] ?? { icgId, kind: "unknown" as const, id: null, name: null, aids: null, avatarUrl: null }), ...t }))
    .sort((a, b) => rank[a.kind] - rank[b.kind] || b.known - a.known || (a.name ?? a.icgId).localeCompare(b.name ?? b.icgId));
}
