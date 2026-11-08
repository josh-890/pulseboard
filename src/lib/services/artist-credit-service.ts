import { Prisma } from "@/generated/prisma/client";
import type { ResolutionStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { normalizeForSearch } from "@/lib/normalize";

// Who a behind-camera credit is (2026-11-08): a credit whose name equals an
// artist's name or one of their aliases — normalised, and no other artist's —
// links by itself; everything else waits on the artist's page to be decided
// one by one (exact matches all at once if you like, similar names per item).

type Db = Pick<Prisma.TransactionClient, "artist" | "$queryRaw">;

/** The one artist a name belongs to, or null when none or several do */
export async function findArtistByExactName(db: Db, rawName: string): Promise<string | null> {
  const norm = normalizeForSearch(rawName);
  if (!norm) return null;
  const hits = await db.artist.findMany({
    where: { OR: [{ nameNorm: norm }, { aliases: { some: { aliasNorm: norm } } }] },
    select: { id: true },
    take: 2,
  });
  return hits.length === 1 ? hits[0].id : null;
}

/** How a new photographer credit from an import starts: linked when its name is unmistakable */
export async function artistCreditResolution(
  db: Db,
  rawName: string,
): Promise<{ resolutionStatus: ResolutionStatus; resolvedArtistId: string | null }> {
  const artistId = await findArtistByExactName(db, rawName);
  return artistId ? { resolutionStatus: "RESOLVED", resolvedArtistId: artistId } : { resolutionStatus: "UNRESOLVED", resolvedArtistId: null };
}

// ─── Aliases ─────────────────────────────────────────────────────────────────

export class AliasRefused extends Error {}

export async function addArtistAlias(artistId: string, alias: string): Promise<{ id: string; linked: number }> {
  const trimmed = alias.trim();
  const aliasNorm = normalizeForSearch(trimmed);
  if (!aliasNorm) throw new AliasRefused("An alias needs a name");
  const artist = await prisma.artist.findUniqueOrThrow({ where: { id: artistId }, select: { nameNorm: true } });
  if (artist.nameNorm === aliasNorm) throw new AliasRefused("That is the artist's own name");
  const existing = await prisma.artistAlias.findUnique({ where: { artistId_aliasNorm: { artistId, aliasNorm } } });
  if (existing) throw new AliasRefused("The artist already has that alias");
  const row = await prisma.artistAlias.create({ data: { artistId, alias: trimmed, aliasNorm } });
  // Credits waiting under exactly this name now have their artist
  const linked = await linkExactCredits(artistId, [aliasNorm]);
  return { id: row.id, linked };
}

export async function removeArtistAlias(aliasId: string): Promise<void> {
  await prisma.artistAlias.delete({ where: { id: aliasId } });
}

// ─── Credits waiting for their artist ───────────────────────────────────────

export type WaitingCredit = {
  creditId: string;
  rawName: string;
  setId: string;
  setTitle: string;
  releaseDate: Date | null;
  channelName: string | null;
  /** Exactly one of the artist's names (and nobody else's) */
  exact: boolean;
  /** Another artist has this exact name too — only you can say who */
  ambiguous: boolean;
  similarity: number;
};

/** Behind-camera credits not yet resolved (the ones an artist can take, ADR-0021) */
const OPEN_ARTIST_CREDIT = Prisma.sql`
  cr."resolutionStatus" = 'UNRESOLVED'
  AND (cr."roleDefinitionId" IS NULL OR EXISTS (
    SELECT 1 FROM "ContributionRoleDefinition" rd JOIN "ContributionRoleGroup" rg ON rg.id = rd."groupId"
    WHERE rd.id = cr."roleDefinitionId" AND rg.kind = 'BEHIND_CAMERA'))`;

async function artistNames(artistId: string): Promise<string[]> {
  const a = await prisma.artist.findUniqueOrThrow({
    where: { id: artistId },
    select: { nameNorm: true, aliases: { select: { aliasNorm: true } } },
  });
  return [a.nameNorm, ...a.aliases.map((x) => x.aliasNorm)];
}

/** Credits that may be this artist's: exact name matches first, then similar names */
export async function getWaitingCredits(artistId: string, limit = 100): Promise<WaitingCredit[]> {
  const names = await artistNames(artistId);
  const rows = await prisma.$queryRaw<
    Array<{
      creditId: string;
      rawName: string;
      setId: string;
      setTitle: string;
      releaseDate: Date | null;
      channelName: string | null;
      exact: boolean;
      sim: number;
      others: bigint;
    }>
  >(Prisma.sql`
    SELECT cr.id AS "creditId", cr."rawName", s.id AS "setId", s.title AS "setTitle", s."releaseDate",
      c.name AS "channelName",
      cr."rawNameNorm" = ANY(${names}::text[]) AS exact,
      (SELECT max(similarity(cr."rawNameNorm", n)) FROM unnest(${names}::text[]) n) AS sim,
      (SELECT count(*) FROM "Artist" a
         WHERE a.id <> ${artistId}
           AND (a."nameNorm" = cr."rawNameNorm" OR EXISTS (SELECT 1 FROM artist_alias x WHERE x."artistId" = a.id AND x."aliasNorm" = cr."rawNameNorm"))) AS others
    FROM "SetCreditRaw" cr
    JOIN "Set" s ON s.id = cr."setId"
    LEFT JOIN "Channel" c ON c.id = s."channelId"
    WHERE ${OPEN_ARTIST_CREDIT}
      AND cr."rawNameNorm" IS NOT NULL
      AND (cr."rawNameNorm" = ANY(${names}::text[])
           OR EXISTS (SELECT 1 FROM unnest(${names}::text[]) n WHERE similarity(cr."rawNameNorm", n) >= 0.5))
    ORDER BY exact DESC, sim DESC, s."releaseDate" DESC NULLS LAST
    LIMIT ${limit}
  `);
  return rows.map((r) => ({
    creditId: r.creditId,
    rawName: r.rawName,
    setId: r.setId,
    setTitle: r.setTitle,
    releaseDate: r.releaseDate,
    channelName: r.channelName,
    exact: r.exact,
    ambiguous: r.exact && Number(r.others) > 0,
    similarity: Number(r.sim),
  }));
}

/** Link the given waiting credits to the artist (only behind-camera, only still open) */
export async function linkCreditsToArtist(artistId: string, creditIds: string[]): Promise<number> {
  if (creditIds.length === 0) return 0;
  return prisma.$executeRaw(Prisma.sql`
    UPDATE "SetCreditRaw" cr
    SET "resolutionStatus" = 'RESOLVED', "resolvedArtistId" = ${artistId}, "resolvedPersonId" = NULL, "updatedAt" = now()
    WHERE cr.id = ANY(${creditIds}::text[]) AND ${OPEN_ARTIST_CREDIT}
  `);
}

/**
 * Link every open credit whose name is exactly one of `norms` and belongs to no
 * other artist — what "exact match links by itself" means after the fact.
 */
export async function linkExactCredits(artistId: string, norms?: string[]): Promise<number> {
  const names = norms ?? (await artistNames(artistId));
  return prisma.$executeRaw(Prisma.sql`
    UPDATE "SetCreditRaw" cr
    SET "resolutionStatus" = 'RESOLVED', "resolvedArtistId" = ${artistId}, "updatedAt" = now()
    WHERE ${OPEN_ARTIST_CREDIT}
      AND cr."rawNameNorm" = ANY(${names}::text[])
      AND NOT EXISTS (SELECT 1 FROM "Artist" a WHERE a.id <> ${artistId}
            AND (a."nameNorm" = cr."rawNameNorm" OR EXISTS (SELECT 1 FROM artist_alias x WHERE x."artistId" = a.id AND x."aliasNorm" = cr."rawNameNorm")))
  `);
}
