import { gunzipSync } from 'node:zlib'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { prisma } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import { minioClient, getMinioBucket } from '@/lib/minio'
import { runWithTenant } from '@/lib/tenant-context'
import { parseFilename, parseImportFile } from '@/lib/services/import/parser'
import { createBatch } from '@/lib/services/import/staging-service'
import { buildImportItemDecisions } from '@/lib/services/import/build-decisions'
import { requestCoversForBatch } from '@/lib/services/catalogue-cover-service'

// ADR-0038 S6. Every catalogue run keeps each folder's newest import file in
// MinIO (gzip). Develop reads it instead of an upload — the usual import and
// review follow. For a Person's folder the file is a hint only: what it would
// bring is worked out when it arrives, and Review opens the ADR-0009 review.

export class DevelopRefused extends Error {}

export async function readObject(key: string): Promise<Buffer> {
  const res = await minioClient.send(new GetObjectCommand({ Bucket: getMinioBucket(), Key: key }))
  if (!res.Body) throw new Error(`Empty object ${key}`)
  return Buffer.from(await res.Body.transformToByteArray())
}

type StoredFile = { name: string; content: string; path: string }

/** Her newest catalogue file as the last run stored it, or null */
export async function readCatalogueFile(icgId: string): Promise<StoredFile | null> {
  const folder = await prisma.catalogueFolder.findFirst({
    where: { icgId, goneAt: null, fileKey: { not: null }, newestFile: { not: null } },
    orderBy: [{ newestDate: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
    select: { path: true, fileKey: true, newestFile: true },
  })
  if (!folder?.fileKey || !folder.newestFile) return null
  const content = gunzipSync(await readObject(folder.fileKey)).toString('utf8')
  return { name: folder.newestFile, content, path: folder.path }
}

export async function hasCatalogueFile(icgId: string | null): Promise<boolean> {
  if (!icgId) return false
  const n = await prisma.catalogueFolder.count({ where: { icgId, goneAt: null, fileKey: { not: null }, newestFile: { not: null } } })
  return n > 0
}

/** Develop a Contact: an import batch from her stored file — no upload; the review follows */
export async function developContact(contactId: string): Promise<{ batchId: string; coversWanted: number }> {
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { icgId: true } })
  if (!contact) throw new DevelopRefused('Contact not found')
  if (!contact.icgId) throw new DevelopRefused('She has no ICG-ID — link her to a Person instead')
  if (await prisma.person.findUnique({ where: { icgId: contact.icgId }, select: { id: true } })) {
    throw new DevelopRefused('A Person with her ICG-ID exists already — link her instead')
  }
  const file = await readCatalogueFile(contact.icgId)
  if (!file) throw new DevelopRefused('No catalogue file is stored for her — Add as Person instead')
  const batch = await createBatch(file.name, file.content)
  // Her set covers come from the catalogue with the next agent pass (S7)
  const { wanted } = await requestCoversForBatch(batch.id, 'develop')
  return { batchId: batch.id, coversWanted: wanted }
}

/** Sets in the app credited to her by ICG-ID — they join her career when she becomes a Person (D2.3) */
export async function countCreditedSets(icgId: string): Promise<number> {
  const rows = await prisma.setCreditRaw.findMany({
    where: { resolvedContact: { icgId } },
    select: { setId: true },
    distinct: ['setId'],
  })
  return rows.length
}

export type DevelopNote = { creditedSets: number; nameKept: string | null; portraitKept: boolean }

/** Importing someone who is still a Contact: what carries over (shown on the import page) */
export async function getDevelopNote(icgId: string): Promise<DevelopNote | null> {
  if (!icgId || (await prisma.person.findUnique({ where: { icgId }, select: { id: true } }))) return null
  const c = await prisma.contact.findUnique({ where: { icgId }, select: { name: true, nameSetByUser: true, portraitKey: true } })
  if (!c) return null
  return { creditedSets: await countCreditedSets(icgId), nameKept: c.nameSetByUser ? c.name : null, portraitKept: Boolean(c.portraitKey) }
}

// ── The Person hint ──────────────────────────────────────────────────────────

export type PersonHint = {
  /** Date in the newer file's name */
  fileDate: string | null
  /** Date of the newest file you imported for her, null when none */
  importedDate: string | null
  newSets: number
  changedValues: number
}

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)

/**
 * What a Person's catalogue file would bring — only when it is newer than the
 * newest file you imported for her (an older or the same file would just list
 * your own corrections as changes). Null: not newer, or nothing new.
 */
export async function workOutPersonHint(icgId: string, file: { name: string; content: string }): Promise<PersonHint | null> {
  const person = await prisma.person.findUnique({ where: { icgId }, select: { id: true } })
  if (!person) return null
  const fileDate = parseFilename(file.name).extractionDate
  const lastBatch = await prisma.importBatch.findFirst({
    where: { subjectIcgId: icgId },
    orderBy: [{ extractionDate: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    select: { extractionDate: true, createdAt: true },
  })
  const importedDate = lastBatch ? day(lastBatch.extractionDate ?? lastBatch.createdAt) : null
  if (importedDate && (!fileDate || fileDate <= importedDate)) return null

  const parsed = parseImportFile(file.content)
  const decisions = await buildImportItemDecisions(prisma, person.id, parsed.person)
  const changedValues = decisions.scalars.length + decisions.aliases.length + decisions.personColumns.length
  const ids = [...new Set(parsed.sets.map((s) => s.externalId).filter(Boolean))]
  const known = new Set<string>()
  if (ids.length) {
    const [sets, staged] = await Promise.all([
      prisma.set.findMany({ where: { externalId: { in: ids } }, select: { externalId: true } }),
      prisma.stagingSet.findMany({ where: { externalId: { in: ids } }, select: { externalId: true } }),
    ])
    for (const r of [...sets, ...staged]) if (r.externalId) known.add(r.externalId)
  }
  const newSets = ids.filter((id) => !known.has(id)).length
  if (newSets === 0 && changedValues === 0) return null
  return { fileDate, importedDate, newSets, changedValues }
}

/** Work out the hint of every Person's folder whose file changed since its hint */
export async function refreshPersonHints(): Promise<{ checked: number; hints: number }> {
  const folders = await prisma.$queryRaw<{ path: string; icgId: string; fileKey: string; newestFile: string }[]>`
    SELECT path, "icgId", "fileKey", "newestFile" FROM catalogue_folder
    WHERE kind = 'person' AND "goneAt" IS NULL AND "fileKey" IS NOT NULL AND "newestFile" IS NOT NULL
      AND "icgId" IS NOT NULL AND "hintFileKey" IS DISTINCT FROM "fileKey"`
  let hints = 0
  for (const f of folders) {
    try {
      const content = gunzipSync(await readObject(f.fileKey)).toString('utf8')
      const hint = await workOutPersonHint(f.icgId, { name: f.newestFile, content })
      if (hint) hints++
      await prisma.catalogueFolder.update({
        where: { path: f.path },
        data: { hint: hint ?? Prisma.DbNull, hintFileKey: f.fileKey },
      })
    } catch (err) {
      // One unreadable file fails only itself; it is tried again next time
      console.error(`[person-hint] ${f.path}:`, err)
    }
  }
  return { checked: folders.length, hints }
}

const refreshing = new Map<string, Promise<void>>()

/** In the background, one pass per tenant at a time (after every catalogue run) */
export function requestPersonHints(tenantId: string): void {
  if (refreshing.has(tenantId)) return
  const pass = runWithTenant(tenantId, () => refreshPersonHints())
    .then(() => undefined)
    .catch((err) => console.error(`[person-hint] ${tenantId} failed:`, err))
    .finally(() => refreshing.delete(tenantId))
  refreshing.set(tenantId, pass)
}

export function personHintsRunning(tenantId: string): boolean {
  return refreshing.has(tenantId)
}

function asHint(v: Prisma.JsonValue | null): PersonHint | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as unknown as PersonHint) : null
}

/** The newest file date you imported per ICG-ID — a hint at or before it is done */
async function importedDates(icgIds: string[]): Promise<Map<string, string>> {
  if (!icgIds.length) return new Map()
  const rows = await prisma.$queryRaw<{ icgId: string; d: Date }[]>`
    SELECT "subjectIcgId" AS "icgId", max(coalesce("extractionDate", "createdAt")) AS d
    FROM import_batch WHERE "subjectIcgId" = ANY(${icgIds}::text[]) GROUP BY "subjectIcgId"`
  return new Map(rows.map((r) => [r.icgId, day(r.d)!]))
}

const stillNewer = (hint: PersonHint, imported: string | undefined) =>
  !imported || (hint.fileDate !== null && hint.fileDate > imported)

/** The hint on her Person page, or null */
export async function getPersonHint(icgId: string | null): Promise<PersonHint | null> {
  if (!icgId) return null
  const f = await prisma.catalogueFolder.findFirst({
    where: { icgId, kind: 'person', goneAt: null, hint: { not: Prisma.DbNull } },
    select: { hint: true },
  })
  const hint = asHint(f?.hint ?? null)
  if (!hint) return null
  // Imported since by hand (an upload of that file or a newer one): done
  return stillNewer(hint, (await importedDates([icgId])).get(icgId)) ? hint : null
}

export type PersonHintRow = PersonHint & { personId: string; name: string; icgId: string }

/** Every Person a newer catalogue file waits for — the runs page lists them */
export async function listPersonHints(): Promise<PersonHintRow[]> {
  const folders = await prisma.catalogueFolder.findMany({
    where: { kind: 'person', goneAt: null, hint: { not: Prisma.DbNull }, icgId: { not: null } },
    select: { icgId: true, hint: true, name: true },
  })
  const icgIds = folders.map((f) => f.icgId!)
  const [persons, imported] = await Promise.all([
    prisma.person.findMany({
      where: { icgId: { in: icgIds } },
      select: { id: true, icgId: true, aliases: { where: { isCommon: true }, take: 1, select: { name: true } } },
    }),
    importedDates(icgIds),
  ])
  const byIcg = new Map(persons.map((p) => [p.icgId, p]))
  const rows: PersonHintRow[] = []
  for (const f of folders) {
    const p = byIcg.get(f.icgId!)
    const hint = asHint(f.hint)
    if (!p || !hint || !stillNewer(hint, imported.get(f.icgId!))) continue
    rows.push({ ...hint, personId: p.id, icgId: p.icgId, name: p.aliases[0]?.name ?? f.name })
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

/** How many Person folders still wait to be weighed (their file changed since the hint) */
export async function countUnweighedPersonFiles(): Promise<number> {
  const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM catalogue_folder
    WHERE kind = 'person' AND "goneAt" IS NULL AND "fileKey" IS NOT NULL AND "hintFileKey" IS DISTINCT FROM "fileKey"`
  return n
}

/** Review the newer file: an import batch from it (the ADR-0009 review) — the hint is done */
export async function reviewNewerFile(personId: string): Promise<{ batchId: string; coversWanted: number }> {
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { icgId: true } })
  if (!person) throw new DevelopRefused('Person not found')
  const file = await readCatalogueFile(person.icgId)
  if (!file) throw new DevelopRefused('No catalogue file is stored for her')
  const batch = await createBatch(file.name, file.content)
  await prisma.catalogueFolder.updateMany({ where: { icgId: person.icgId, kind: 'person' }, data: { hint: Prisma.DbNull } })
  const { wanted } = await requestCoversForBatch(batch.id, 'review')
  return { batchId: batch.id, coversWanted: wanted }
}
