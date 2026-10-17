import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { GalleryItem } from "@/lib/types";
import { getCoverPhotosForSets, getMediaGalleryItemsByIds } from "./media-service";
import { BEHIND_CAMERA_GROUP } from "./session-contributors";

// The Overview showcase of a person (2026-10-16): their best photos first, the way
// you marked them — iconic, then ★, then outtake — filled up with production
// photos at random — two per set in turn, so big sets do not crowd out small
// ones. Iconic stays in front in the order you tagged it; everything
// else rotates once a day (a seeded order: the same all day, new tomorrow).
// "Shows the person" is the tag query's rule (ADR-0023, `imageShows`), so the
// showcase and `person:ICG-ID` agree.
//
// Mode "random" (Shuffle): the marks don't choose — production photos only, two
// per set in turn, in the order of the caller's seed (a new one per shuffle). The
// marks still come back as `source`, so a marked photo keeps its chip.

export type ShowcaseSource = "iconic" | "favorite" | "outtake" | "random";
export type ShowcaseItem = GalleryItem & { source: ShowcaseSource };
export type PersonShowcase = {
  /** Which selection this is */
  mode: ShowcaseMode;
  items: ShowcaseItem[];
  /** Marked photos among the items */
  curatedCount: number;
  /** Sets (or sessions, for photos in no set) the items come from */
  setCount: number;
};
export type ShowcaseMode = "best" | "random";

// A fresh seed per deal (the client makes its own for Shuffle)
const newShowcaseSeed = () => `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

const SOURCE_BY_LEVEL: Record<number, ShowcaseSource> = { 1: "iconic", 2: "favorite", 3: "outtake", 4: "random" };

// The day the rotation turns over, in the display zone
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.DISPLAY_TIMEZONE ?? "Europe/Berlin" });

export async function getPersonShowcase(
  personId: string,
  opts: { size?: number; day?: string; mode?: ShowcaseMode; seed?: string } = {},
): Promise<PersonShowcase> {
  const size = opts.size ?? 48;
  const random = opts.mode === "random";
  const seed = random && opts.seed ? opts.seed : `${personId}:${opts.day ?? DAY.format(new Date())}`;

  // Best: by mark level, the random fill round-robin over sets. Random: one
  // round-robin over everything, the marks ignored for the choice.
  const roundPartition = random ? Prisma.sql`grp` : Prisma.sql`level, grp`;
  const keep = random ? Prisma.sql`"sessionType" <> 'REFERENCE'` : Prisma.sql`level < 4 OR "sessionType" <> 'REFERENCE'`;
  const order = random
    ? Prisma.sql`round, md5(grp || ${seed}), md5(id || ${seed})`
    : Prisma.sql`level, "iconicAt" DESC NULLS LAST,
      CASE WHEN level = 4 THEN round END, CASE WHEN level = 4 THEN md5(grp || ${seed}) END, md5(id || ${seed})`;

  // Set-based, not per image: a person's photos run to thousands. "Shown" is the
  // rule of `imageShows` in tag-predicates.ts — on camera in the image's session
  // and not hidden from it, or linked directly
  const rows = await prisma.$queryRaw<{ id: string; level: number; grp: string }[]>`
    WITH on_camera AS (
      SELECT DISTINCT sc."sessionId"
      FROM "SessionContribution" sc
      JOIN "ContributionRoleDefinition" rd ON rd.id = sc."roleDefinitionId"
      JOIN "ContributionRoleGroup" rg ON rg.id = rd."groupId"
      WHERE sc."personId" = ${personId} AND rg.name <> ${BEHIND_CAMERA_GROUP}
    ),
    -- Two indexed ways in, united (an OR across them scans every image)
    ids AS (
      SELECT mi.id FROM "MediaItem" mi
      WHERE mi."sessionId" IN (SELECT "sessionId" FROM on_camera)
        AND NOT EXISTS (SELECT 1 FROM media_item_hidden_person h WHERE h."mediaItemId" = mi.id AND h."personId" = ${personId})
      UNION
      SELECT pml."mediaItemId" FROM "PersonMediaLink" pml WHERE pml."personId" = ${personId}
    ),
    shown AS (
      SELECT mi.id, mi."isFavorite", mi."sessionId", s.type AS "sessionType"
      FROM ids
      JOIN "MediaItem" mi ON mi.id = ids.id
      JOIN "Session" s ON s.id = mi."sessionId"
      WHERE mi."mediaType" = 'PHOTO' AND NOT mi."isAnnotation" AND mi."decodeIssue" IS NULL
    ),
    marks AS (
      SELECT t."mediaItemId" AS id,
        max(t."createdAt") FILTER (WHERE d.slug = 'iconic') AS "iconicAt",
        bool_or(d.slug = 'outtake') AS outtake
      FROM media_item_tag t
      JOIN tag_definition d ON d.id = t."tagDefinitionId"
      WHERE d.slug IN ('iconic', 'outtake') AND t."mediaItemId" IN (SELECT id FROM shown)
      GROUP BY t."mediaItemId"
    ),
    -- The set a photo belongs to, from the person's own sets (SetMediaItem is
    -- indexed by set, not by photo); a photo in no set groups by its session
    set_of AS (
      SELECT smi."mediaItemId" AS id, min(smi."setId") AS "setId"
      FROM "SetMediaItem" smi
      WHERE smi."setId" IN (SELECT sp."setId" FROM "SetParticipant" sp WHERE sp."personId" = ${personId})
      GROUP BY smi."mediaItemId"
    ),
    leveled AS (
      SELECT sh.id, m."iconicAt", sh."sessionType", coalesce(so."setId", sh."sessionId") AS grp,
        CASE WHEN m."iconicAt" IS NOT NULL THEN 1 WHEN sh."isFavorite" THEN 2 WHEN m.outtake THEN 3 ELSE 4 END AS level
      FROM shown sh
      LEFT JOIN marks m ON m.id = sh.id
      LEFT JOIN set_of so ON so.id = sh.id
    ),
    ranked AS (
      SELECT l.*,
        -- The random fill goes round the sets, two photos each per round, so a
        -- 300-photo set does not crowd out a 30-photo one
        (row_number() OVER (PARTITION BY ${roundPartition} ORDER BY md5(id || ${seed})) - 1) / 2 AS round
      FROM leveled l
      -- Random picks come from production work, never the reference photos
      WHERE ${keep}
    )
    SELECT id, level, grp FROM ranked
    ORDER BY ${order}
    LIMIT ${size}
  `;

  const items = await getMediaGalleryItemsByIds(rows.map((r) => r.id));
  const byId = new Map(items.map((i) => [i.id, i]));
  return {
    mode: random ? "random" : "best",
    items: rows.flatMap((r) => {
      const item = byId.get(r.id);
      return item ? [{ ...item, source: SOURCE_BY_LEVEL[r.level] }] : [];
    }),
    curatedCount: rows.filter((r) => r.level < 4).length,
    setCount: new Set(rows.map((r) => r.grp)).size,
  };
}

/**
 * What the Overview opens with (2026-10-17): a random deal, new on every visit.
 * A person with photos only in reference sessions has no random deal; they open
 * in Best, which still shows the reference photos you marked.
 */
export async function getPersonOverviewShowcase(personId: string): Promise<PersonShowcase> {
  const random = await getPersonShowcase(personId, { mode: "random", seed: newShowcaseSeed() });
  return random.items.length > 0 ? random : getPersonShowcase(personId);
}

export type KnownForSet = {
  id: string;
  title: string;
  year: number | null;
  channelName: string | null;
  rating: number | null;
  isVideo: boolean;
  coverUrl: string | null;
  coverFocalX: number | null;
  coverFocalY: number | null;
};

/** The person's sets as posters: your highest-rated first, then the newest */
export async function getPersonKnownFor(personId: string, limit = 8): Promise<KnownForSet[]> {
  const sets = await prisma.set.findMany({
    where: { participants: { some: { personId } } },
    orderBy: [{ rating: { sort: "desc", nulls: "last" } }, { releaseDate: { sort: "desc", nulls: "last" } }],
    take: limit,
    select: { id: true, title: true, releaseDate: true, rating: true, type: true, channel: { select: { name: true } } },
  });
  const covers = await getCoverPhotosForSets(sets.map((s) => s.id));
  return sets.map((s) => {
    const cover = covers.get(s.id);
    return {
      id: s.id,
      title: s.title,
      year: s.releaseDate ? Number(DAY.format(s.releaseDate).slice(0, 4)) : null,
      channelName: s.channel?.name ?? null,
      rating: s.rating,
      isVideo: s.type === "video",
      coverUrl: cover?.url ?? null,
      coverFocalX: cover?.focalX ?? null,
      coverFocalY: cover?.focalY ?? null,
    };
  });
}
