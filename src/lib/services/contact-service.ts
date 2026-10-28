/**
 * Contacts as the catalogue register (ADR-0038, S2): names, search, portrait,
 * and the Contact page.
 *
 * Names follow one rule. The name a Contact shows is, in order: the one the user
 * set (`nameSetByUser` — a rename, or a Contact created by hand), the one in her
 * own catalogue file (`catalogueName`), else the latest import's spelling. How
 * other people's files and sets list her is evidence ("listed as"), read from
 * the credits — it never renames her.
 *
 * Catalogue fields (AKA, channel aliases, birth year, nationality) are read-only
 * here: corrections come with developing her, or by fixing the file.
 */
import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { normalizeForSearch } from "@/lib/normalize";
import { buildUrl } from "@/lib/media-url";
import { minioClient, getMinioBucket } from "@/lib/minio";

type Db = Prisma.TransactionClient | typeof prisma;

const PORTRAIT_MAX_PX = 256;
const PORTRAIT_QUALITY = 82;
const CLOSED_STAGING = ["PROMOTED", "INACTIVE", "SKIPPED"] as const;

/** The one search key: name, catalogue name, AKA, channel aliases and ICG-ID */
export function buildContactSearchNorm(parts: {
  name: string;
  catalogueName?: string | null;
  aka?: string[];
  aliases?: string[];
  icgId?: string | null;
}): string {
  const words = [parts.name, parts.catalogueName ?? "", ...(parts.aka ?? []), ...(parts.aliases ?? []), parts.icgId ?? ""];
  return normalizeForSearch([...new Set(words.map((w) => w.trim()).filter(Boolean))].join(" "));
}

async function recomputeSearchNorm(db: Db, contactId: string): Promise<void> {
  const c = await db.contact.findUnique({
    where: { id: contactId },
    select: { name: true, catalogueName: true, aka: true, icgId: true, channelAliases: { select: { alias: true } } },
  });
  if (!c) return;
  await db.contact.update({
    where: { id: contactId },
    data: {
      searchNorm: buildContactSearchNorm({
        name: c.name,
        catalogueName: c.catalogueName,
        aka: c.aka,
        aliases: c.channelAliases.map((a) => a.alias),
        icgId: c.icgId,
      }),
    },
  });
}

/**
 * The Contact an import mentions by ICG-ID (a co-model, a credited participant).
 * Created when new. An existing one keeps a name the user set or her own file
 * gave; only a Contact with neither takes the import's spelling, as before.
 */
export async function upsertImportedContact(
  db: Db,
  input: { icgId: string; name: string; thumbUrl?: string | null },
): Promise<{ id: string }> {
  const name = input.name.trim() || input.icgId;
  const existing = await db.contact.findUnique({
    where: { icgId: input.icgId },
    select: { id: true, name: true, nameSetByUser: true, catalogueName: true },
  });
  if (!existing) {
    return db.contact.create({
      data: {
        icgId: input.icgId,
        name,
        nameNorm: normalizeForSearch(name),
        searchNorm: buildContactSearchNorm({ name, icgId: input.icgId }),
        thumbUrl: input.thumbUrl ?? null,
        source: "import",
      },
      select: { id: true },
    });
  }
  const keepsName = existing.nameSetByUser || existing.catalogueName !== null;
  if (keepsName || existing.name === name) {
    if (input.thumbUrl) await db.contact.update({ where: { id: existing.id }, data: { thumbUrl: input.thumbUrl } });
    return { id: existing.id };
  }
  await db.contact.update({
    where: { id: existing.id },
    data: { name, nameNorm: normalizeForSearch(name), ...(input.thumbUrl ? { thumbUrl: input.thumbUrl } : {}) },
  });
  await recomputeSearchNorm(db, existing.id);
  return { id: existing.id };
}

/**
 * Rename (sticks: no file or import renames her again), or `null` to go back to
 * the name in her catalogue file.
 */
export async function renameContact(contactId: string, name: string | null): Promise<void> {
  const c = await prisma.contact.findUniqueOrThrow({ where: { id: contactId }, select: { catalogueName: true } });
  const next = name?.trim() || null;
  if (next === null && !c.catalogueName) throw new Error("No catalogue name to go back to");
  await prisma.$transaction(async (tx) => {
    const display = next ?? c.catalogueName!;
    await tx.contact.update({
      where: { id: contactId },
      data: { name: display, nameNorm: normalizeForSearch(display), nameSetByUser: next !== null },
    });
    await recomputeSearchNorm(tx, contactId);
  });
}

export async function setContactNote(contactId: string, note: string): Promise<void> {
  await prisma.contact.update({ where: { id: contactId }, data: { note: note.trim() || null } });
}

/**
 * A portrait the user chose: downscaled like the catalogue portraits, decoded
 * strictly — a damaged file is refused with the reason, never stored half-read.
 */
export async function setContactPortrait(contactId: string, buffer: Buffer): Promise<{ url: string }> {
  await prisma.contact.findUniqueOrThrow({ where: { id: contactId }, select: { id: true } });
  const processed = await sharp(buffer, { failOn: "error" })
    .rotate()
    .resize({ width: PORTRAIT_MAX_PX, height: PORTRAIT_MAX_PX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: PORTRAIT_QUALITY })
    .toBuffer();
  const key = `contact/portrait/${contactId}-${Date.now()}.jpg`;
  await minioClient.send(
    new PutObjectCommand({ Bucket: getMinioBucket(), Key: key, Body: processed, ContentType: "image/jpeg" }),
  );
  await prisma.contact.update({ where: { id: contactId }, data: { portraitKey: key } });
  return { url: buildUrl(key) };
}

/** Back to the catalogue portrait */
export async function clearContactPortrait(contactId: string): Promise<void> {
  await prisma.contact.update({ where: { id: contactId }, data: { portraitKey: null } });
}

/** The face a Contact shows: the chosen portrait, else the catalogue one */
export async function contactAvatarUrls(
  contacts: { icgId: string | null; portraitKey: string | null }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const need = contacts.filter((c) => !c.portraitKey && c.icgId).map((c) => c.icgId!);
  const catalogue = need.length
    ? await prisma.catalogueAvatar.findMany({ where: { icgId: { in: need }, key: { not: null } }, select: { icgId: true, key: true } })
    : [];
  const byIcg = new Map(catalogue.map((a) => [a.icgId, a.key!]));
  for (const c of contacts) {
    const key = c.portraitKey ?? (c.icgId ? byIcg.get(c.icgId) : undefined);
    if (key && c.icgId) out.set(c.icgId, buildUrl(key));
  }
  return out;
}

// ── The Contact page ─────────────────────────────────────────────────────────

export type ContactCatalogueSet = {
  coverId: string;
  date: Date | null;
  channelName: string;
  title: string;
  isVideo: boolean;
  castIcgIds: string[];
  /** In the app: a Set or staged set carries this CoverId */
  inApp: { setId: string | null; stagingSetId: string | null } | null;
  inArchive: boolean;
};

export type ContactDetail = NonNullable<Awaited<ReturnType<typeof getContactDetail>>>;

export async function getContactDetail(contactId: string) {
  const c = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      channelAliases: { orderBy: [{ channelName: "asc" }, { alias: "asc" }] },
      claims: {
        select: {
          subjectPerson: {
            select: { id: true, icgId: true, aliases: { where: { isCommon: true }, take: 1, select: { name: true } } },
          },
        },
      },
      credits: {
        select: {
          rawName: true,
          set: { select: { id: true, title: true, releaseDate: true, channel: { select: { name: true } } } },
        },
      },
      attributions: {
        select: { archiveFolder: { select: { id: true, folderName: true } } },
        orderBy: { confirmedAt: "desc" },
        take: 100,
      },
    },
  });
  if (!c) return null;

  // Already a Person? Then this page is stale — the caller sends her there
  const person = c.icgId ? await prisma.person.findUnique({ where: { icgId: c.icgId }, select: { id: true } }) : null;

  // Channel names link to channels through import aliases only (ADR-0038)
  const channelNames = [...new Set(c.channelAliases.map((a) => a.channelName))];
  const linked = channelNames.length
    ? await prisma.channel.findMany({
        where: { importAliases: { hasSome: channelNames } },
        select: { id: true, name: true, importAliases: true },
      })
    : [];
  const channelOf = new Map<string, { id: string; name: string }>();
  for (const ch of linked) for (const a of ch.importAliases) if (channelNames.includes(a)) channelOf.set(a, { id: ch.id, name: ch.name });

  const avatars = await contactAvatarUrls([{ icgId: c.icgId, portraitKey: c.portraitKey }]);
  const catalogueAvatar = c.icgId
    ? await prisma.catalogueAvatar.findUnique({ where: { icgId: c.icgId }, select: { key: true } })
    : null;

  const [catalogueSets, catalogueSetCount, waiting] = c.icgId
    ? await Promise.all([
        prisma.$queryRaw<
          { coverId: string; date: Date | null; channelName: string; title: string; isVideo: boolean; castIcgIds: string[] }[]
        >`SELECT "coverId", date, "channelName", title, "isVideo", "castIcgIds" FROM catalogue_set
          WHERE "castIcgIds" @> ARRAY[${c.icgId}]::text[] ORDER BY date DESC NULLS LAST, title LIMIT 300`,
        prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM catalogue_set WHERE "castIcgIds" @> ARRAY[${c.icgId}]::text[]`,
        prisma.stagingSet.findMany({
          where: { participantIcgIds: { has: c.icgId }, status: { notIn: [...CLOSED_STAGING] } },
          select: { id: true, title: true, releaseDate: true, channelName: true, isVideo: true },
          orderBy: { releaseDate: "desc" },
          take: 100,
        }),
      ])
    : [[], [{ n: 0 }], []];

  // Which catalogue sets the app (and the archive) already holds
  const coverIds = catalogueSets.map((s) => s.coverId);
  const [appSets, stagedSets] = coverIds.length
    ? await Promise.all([
        prisma.set.findMany({
          where: { externalId: { in: coverIds } },
          select: { id: true, externalId: true, archiveLinks: { where: { status: "CONFIRMED" }, select: { id: true }, take: 1 } },
        }),
        prisma.stagingSet.findMany({
          where: { externalId: { in: coverIds } },
          select: { id: true, externalId: true, archiveLinks: { where: { status: "CONFIRMED" }, select: { id: true }, take: 1 } },
        }),
      ])
    : [[], []];
  const setByCover = new Map(appSets.map((s) => [s.externalId!, s]));
  const stagedByCover = new Map(stagedSets.map((s) => [s.externalId!, s]));
  const sets: ContactCatalogueSet[] = catalogueSets.map((s) => {
    const set = setByCover.get(s.coverId);
    const staged = stagedByCover.get(s.coverId);
    return {
      ...s,
      inApp: set || staged ? { setId: set?.id ?? null, stagingSetId: staged?.id ?? null } : null,
      inArchive: Boolean(set?.archiveLinks.length || staged?.archiveLinks.length),
    };
  });

  const listedAs = [...new Set(c.credits.map((cr) => cr.rawName.trim()).filter((n) => n && n !== c.name))];
  const creditedSets = [...new Map(c.credits.filter((cr) => cr.set).map((cr) => [cr.set!.id, cr.set!])).values()];

  return {
    id: c.id,
    icgId: c.icgId,
    name: c.name,
    catalogueName: c.catalogueName,
    nameSetByUser: c.nameSetByUser,
    source: c.source,
    aka: c.aka,
    birthYear: c.birthYear,
    nationality: c.nationality,
    catalogueDate: c.catalogueDate,
    goneFromCatalogueAt: c.goneFromCatalogueAt,
    note: c.note,
    ignoredAt: c.ignoredAt,
    avatarUrl: c.icgId ? (avatars.get(c.icgId) ?? null) : c.portraitKey ? buildUrl(c.portraitKey) : null,
    hasChosenPortrait: c.portraitKey !== null,
    hasCataloguePortrait: Boolean(catalogueAvatar?.key),
    personId: person?.id ?? null,
    channelAliases: c.channelAliases.map((a) => ({ channelName: a.channelName, alias: a.alias, channel: channelOf.get(a.channelName) ?? null })),
    listedAs,
    mentionedBy: c.claims.map((cl) => ({
      id: cl.subjectPerson.id,
      icgId: cl.subjectPerson.icgId,
      name: cl.subjectPerson.aliases[0]?.name ?? cl.subjectPerson.icgId,
    })),
    catalogueSets: sets,
    catalogueSetCount: catalogueSetCount[0]?.n ?? 0,
    waitingStagedSets: waiting,
    creditedSets,
    archiveFolders: c.attributions.map((a) => a.archiveFolder),
  };
}
