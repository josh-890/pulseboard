/**
 * The catalogue load (ADR-0038, S3): runs, folders, Undo.
 *
 * The agent on the Windows box walks the catalogue and sends folders; the app
 * judges each with its own parser (catalogue-load.ts) and writes it in a
 * transaction of its own — one bad folder fails only itself, recorded with its
 * reason on the problem list. What a run writes is tagged with it: rows it
 * created carry the run id, rows that existed get their previous state saved,
 * so Undo — latest run first — puts everything back without touching the
 * user's work.
 *
 * Rules (ADR-0038): a run never writes to a Person (her folder, file and sets
 * are kept — a newer file is a hint, S6); a Contact's name follows her own file
 * unless the user named her; an ignored Contact stays ignored but is enriched; a
 * folder gone from the catalogue is never deleted, it is marked.
 */
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { prisma } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import { minioClient, getMinioBucket } from '@/lib/minio'
import { normalizeForSearch } from '@/lib/normalize'
import { getSetting } from '@/lib/services/setting-service'
import { buildContactSearchNorm } from '@/lib/services/contact-service'
import {
  duplicateFolderIcgIds,
  extractFolder,
  mergeCatalogueSet,
  type CatalogueSetRow,
  type LoadFolderInput,
} from '@/lib/services/catalogue-load'

type Tx = Prisma.TransactionClient

/** The first load needs a prod backup this fresh (scripts/tenant-backup.sh records it) */
export const BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const BACKUP_SETTING = 'backup.lastAt'
/** A run nobody finished for this long is marked failed when the next one starts */
const STALE_RUN_MS = 2 * 60 * 60 * 1000

export type RunCounts = {
  folders: number
  new: number
  enriched: number
  persons: number
  quarantined: number
  flagged: number
  failed: number
  setsNew: number
  setsUpdated: number
  gone: number
  duplicateIcgIds?: string[]
}

const ZERO: RunCounts = {
  folders: 0, new: 0, enriched: 0, persons: 0, quarantined: 0, flagged: 0, failed: 0, setsNew: 0, setsUpdated: 0, gone: 0,
}

export class CatalogueLoadRefused extends Error {}

// ── Backup ───────────────────────────────────────────────────────────────────

export async function getBackupStatus(): Promise<{ lastAt: Date | null; fresh: boolean }> {
  const raw = await getSetting(BACKUP_SETTING)
  const lastAt = raw ? new Date(raw) : null
  const fresh = Boolean(lastAt && !Number.isNaN(lastAt.getTime()) && Date.now() - lastAt.getTime() < BACKUP_MAX_AGE_MS)
  return { lastAt: lastAt && !Number.isNaN(lastAt.getTime()) ? lastAt : null, fresh }
}

// ── Start ────────────────────────────────────────────────────────────────────

/**
 * Open a run. The agent sends its folder index (path + folder-name ICG-ID); the
 * app answers with the signature of every folder it already holds, so only
 * what changed is sent. The first load ever needs a fresh backup.
 */
export async function startRun(input: {
  all: boolean
  folders: { path: string; dirIcgId: string | null }[]
}): Promise<{ runId: string; mode: string; known: Record<string, string> }> {
  const running = await prisma.catalogueRun.findFirst({ where: { status: 'RUNNING' }, orderBy: { startedAt: 'desc' } })
  if (running) {
    if (Date.now() - running.startedAt.getTime() < STALE_RUN_MS) {
      throw new CatalogueLoadRefused(`Run ${running.id} is still running (started ${running.startedAt.toISOString()})`)
    }
    await prisma.catalogueRun.update({ where: { id: running.id }, data: { status: 'FAILED', finishedAt: new Date() } })
  }
  const previous = await prisma.catalogueRun.count({ where: { status: { in: ['DONE', 'FAILED'] } } })
  const mode = previous === 0 ? 'first' : input.all ? 'all' : 'changes'
  if (mode === 'first') {
    const backup = await getBackupStatus()
    if (!backup.fresh) {
      throw new CatalogueLoadRefused(
        `The first load needs a prod backup from the last 24 hours (last: ${backup.lastAt?.toISOString() ?? 'none'}). ` +
          'Run: bash scripts/tenant-backup.sh xpulse',
      )
    }
  }
  const duplicates = [...duplicateFolderIcgIds(input.folders)]
  const run = await prisma.catalogueRun.create({
    data: { mode, counts: { ...ZERO, duplicateIcgIds: duplicates } },
  })
  const known = await prisma.catalogueFolder.findMany({ where: { goneAt: null }, select: { path: true, signature: true } })
  return {
    runId: run.id,
    mode,
    // A full pass ("all", "first") re-sends everything: no signature is known to it
    known: mode === 'changes' ? Object.fromEntries(known.map((k) => [k.path, k.signature])) : {},
  }
}

// ── One folder ───────────────────────────────────────────────────────────────

type FolderOutcome = 'new' | 'enriched' | 'person' | 'quarantined' | 'failed'

export type FolderResult = { path: string; outcome: FolderOutcome; flagged: boolean; setsNew: number; setsUpdated: number; error?: string }

async function storeFile(path: string, file: { name: string; content: string }): Promise<string> {
  const key = `catalogue/file/${createHash('sha1').update(path).digest('hex').slice(0, 16)}/${file.name}.gz`
  await minioClient.send(
    new PutObjectCommand({ Bucket: getMinioBucket(), Key: key, Body: gzipSync(file.content), ContentType: 'application/gzip' }),
  )
  return key
}

/** Save what a row looked like before this run touched it — once per run */
async function snapshot(tx: Tx, runId: string, entity: 'contact' | 'set' | 'folder', key: string, before: unknown) {
  await tx.catalogueRunChange.upsert({
    where: { runId_entity_key: { runId, entity, key } },
    // Plain JSON: dates as ISO strings, read back with new Date() by Undo
    create: { runId, entity, key, before: JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue },
    update: {},
  })
}

const CONTACT_CATALOGUE_FIELDS = {
  id: true, name: true, nameNorm: true, catalogueName: true, aka: true, birthYear: true, nationality: true,
  catalogueDate: true, goneFromCatalogueAt: true, searchNorm: true, catalogueRunId: true, nameSetByUser: true,
} as const

async function contactSnapshot(tx: Tx, contactId: string) {
  const c = await tx.contact.findUniqueOrThrow({ where: { id: contactId }, select: CONTACT_CATALOGUE_FIELDS })
  const aliases = await tx.contactChannelAlias.findMany({
    where: { contactId },
    select: { channelName: true, alias: true, aliasNorm: true },
  })
  return { ...c, aliases }
}

async function folderSnapshot(tx: Tx, path: string) {
  const f = await tx.catalogueFolder.findUnique({ where: { path }, include: { problems: true } })
  return f
}

type SetDbRow = {
  coverId: string
  date: Date | null
  altDates: Date[]
  channelName: string
  title: string
  isVideo: boolean
  castIcgIds: string[]
  disagreements: Prisma.JsonValue
  sourceDate: Date | null
  createdRunId: string | null
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

function fromDb(r: SetDbRow): CatalogueSetRow {
  return {
    coverId: r.coverId,
    date: day(r.date),
    altDates: (r.altDates ?? []).map((d) => day(d)!),
    channelName: r.channelName,
    title: r.title,
    isVideo: r.isVideo,
    castIcgIds: r.castIcgIds ?? [],
    disagreements: (r.disagreements as CatalogueSetRow['disagreements']) ?? null,
    sourceDate: day(r.sourceDate),
  }
}

async function writeSets(tx: Tx, runId: string, incoming: CatalogueSetRow[]): Promise<{ setsNew: number; setsUpdated: number }> {
  if (incoming.length === 0) return { setsNew: 0, setsUpdated: 0 }
  const existing = await tx.$queryRaw<SetDbRow[]>`
    SELECT "coverId", date, "altDates", "channelName", title, "isVideo", "castIcgIds", disagreements, "sourceDate", "createdRunId"
    FROM catalogue_set WHERE "coverId" = ANY(${incoming.map((s) => s.coverId)}::text[])`
  const byId = new Map(existing.map((r) => [r.coverId, r]))
  const rows: (CatalogueSetRow & { createdRunId: string | null })[] = []
  let setsNew = 0
  let setsUpdated = 0
  for (const s of incoming) {
    const before = byId.get(s.coverId)
    if (!before) {
      setsNew++
      rows.push({ ...mergeCatalogueSet(null, s), createdRunId: runId })
      continue
    }
    const merged = mergeCatalogueSet(fromDb(before), s)
    const same = JSON.stringify(merged) === JSON.stringify(fromDb(before))
    if (same) continue
    if (before.createdRunId !== runId) {
      setsUpdated++
      await snapshot(tx, runId, 'set', s.coverId, { ...fromDb(before), createdRunId: before.createdRunId })
    }
    rows.push({ ...merged, createdRunId: before.createdRunId })
  }
  if (rows.length) {
    await tx.$executeRaw`
      INSERT INTO catalogue_set ("coverId", date, "altDates", "channelName", title, "isVideo", "castIcgIds", disagreements, "sourceDate", "createdRunId")
      SELECT "coverId", date, "altDates", "channelName", title, "isVideo", "castIcgIds", disagreements, "sourceDate", "createdRunId"
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(
        "coverId" text, date date, "altDates" date[], "channelName" text, title text, "isVideo" boolean,
        "castIcgIds" text[], disagreements jsonb, "sourceDate" date, "createdRunId" text)
      ON CONFLICT ("coverId") DO UPDATE SET
        date = EXCLUDED.date, "altDates" = EXCLUDED."altDates", "channelName" = EXCLUDED."channelName",
        title = EXCLUDED.title, "isVideo" = EXCLUDED."isVideo", "castIcgIds" = EXCLUDED."castIcgIds",
        disagreements = EXCLUDED.disagreements, "sourceDate" = EXCLUDED."sourceDate"`
  }
  return { setsNew, setsUpdated }
}

async function processFolder(runId: string, input: LoadFolderInput, duplicates: Set<string>): Promise<FolderResult> {
  const ex = extractFolder(input, { duplicate: Boolean(dirIcgIdOf(input) && duplicates.has(dirIcgIdOf(input)!)) })
  const flagged = !ex.quarantined && ex.record.problems.length > 0
  const icgId = ex.identity?.icgId ?? null
  const person = icgId ? await prisma.person.findUnique({ where: { icgId }, select: { id: true } }) : null
  const fileKey = ex.newestFile ? await storeFile(input.path, ex.newestFile) : null
  const outcome: FolderOutcome = ex.quarantined ? 'quarantined' : person ? 'person' : 'new'

  return prisma.$transaction(
    async (tx) => {
      const before = await folderSnapshot(tx, input.path)
      if (before && before.firstRunId !== runId) await snapshot(tx, runId, 'folder', input.path, before)
      const folderData = {
        icgId,
        name: ex.identity?.name ?? ex.record.name,
        kind: ex.quarantined ? 'quarantined' : person ? 'person' : 'contact',
        signature: input.signature,
        newestFile: ex.newestFile?.name ?? null,
        newestDate: ex.record.newestDate ? new Date(ex.record.newestDate) : null,
        fileKey,
        lastRunId: runId,
        goneAt: null,
      }
      await tx.catalogueFolder.upsert({
        where: { path: input.path },
        create: { path: input.path, firstRunId: runId, ...folderData },
        update: folderData,
      })
      await tx.catalogueProblem.deleteMany({ where: { folderPath: input.path } })
      if (ex.record.problems.length) {
        await tx.catalogueProblem.createMany({
          data: ex.record.problems.map((p) => ({
            folderPath: input.path,
            code: p.code,
            detail: p.detail.slice(0, 1000),
            line: p.line ?? null,
            example: p.example?.slice(0, 500) ?? null,
          })),
        })
      }
      if (ex.quarantined || !ex.identity) return { path: input.path, outcome, flagged: false, setsNew: 0, setsUpdated: 0 }

      let result: FolderOutcome = outcome
      if (!person) {
        const id = ex.identity
        const fields = {
          catalogueName: id.name,
          aka: id.aka,
          birthYear: id.birthYear,
          nationality: id.nationality,
          catalogueDate: id.catalogueDate ? new Date(id.catalogueDate) : null,
          goneFromCatalogueAt: null,
        }
        const existing = await tx.contact.findUnique({ where: { icgId: id.icgId }, select: { id: true, nameSetByUser: true, catalogueRunId: true } })
        let contactId: string
        if (existing) {
          if (existing.catalogueRunId !== runId) await snapshot(tx, runId, 'contact', existing.id, await contactSnapshot(tx, existing.id))
          await tx.contact.update({
            where: { id: existing.id },
            // Her own file decides the name — unless the user named her (ADR-0038)
            data: { ...fields, ...(existing.nameSetByUser ? {} : { name: id.name, nameNorm: normalizeForSearch(id.name) }) },
          })
          contactId = existing.id
          if (existing.catalogueRunId !== runId) result = 'enriched'
        } else {
          const created = await tx.contact.create({
            data: { icgId: id.icgId, name: id.name, nameNorm: normalizeForSearch(id.name), source: 'import', catalogueRunId: runId, ...fields },
            select: { id: true },
          })
          contactId = created.id
        }
        await tx.contactChannelAlias.deleteMany({ where: { contactId } })
        if (ex.aliases.length) {
          await tx.contactChannelAlias.createMany({
            data: ex.aliases.map((a) => ({ contactId, channelName: a.channelName, alias: a.alias, aliasNorm: normalizeForSearch(a.alias) })),
            skipDuplicates: true,
          })
        }
        const c = await tx.contact.findUniqueOrThrow({ where: { id: contactId }, select: { name: true } })
        await tx.contact.update({
          where: { id: contactId },
          data: {
            searchNorm: buildContactSearchNorm({
              name: c.name,
              catalogueName: id.name,
              aka: id.aka,
              aliases: ex.aliases.map((a) => a.alias),
              icgId: id.icgId,
            }),
          },
        })
      }
      const sets = await writeSets(tx, runId, ex.sets)
      return { path: input.path, outcome: result, flagged, ...sets }
    },
    { timeout: 60_000 },
  )
}

function dirIcgIdOf(input: LoadFolderInput): string | null {
  const m = input.dirName.match(/_\(([^)]+)\)$/)
  return m ? m[1] : null
}

async function addCounts(runId: string, delta: Partial<RunCounts>) {
  const run = await prisma.catalogueRun.findUniqueOrThrow({ where: { id: runId }, select: { counts: true } })
  const c: Record<string, unknown> = { ...ZERO, ...(run.counts as RunCounts) }
  for (const [k, v] of Object.entries(delta)) {
    if (typeof v === 'number') c[k] = (typeof c[k] === 'number' ? (c[k] as number) : 0) + v
  }
  await prisma.catalogueRun.update({ where: { id: runId }, data: { counts: c as Prisma.InputJsonValue } })
}

export async function processFolders(runId: string, folders: LoadFolderInput[]): Promise<FolderResult[]> {
  const run = await prisma.catalogueRun.findUniqueOrThrow({ where: { id: runId }, select: { status: true, counts: true } })
  if (run.status !== 'RUNNING') throw new CatalogueLoadRefused(`Run ${runId} is ${run.status.toLowerCase()}`)
  const duplicates = new Set((run.counts as RunCounts).duplicateIcgIds ?? [])
  const results: FolderResult[] = []
  for (const f of folders) {
    try {
      results.push(await processFolder(runId, f, duplicates))
    } catch (err) {
      // One folder that throws costs that folder, never the run
      const error = err instanceof Error ? err.message : String(err)
      console.error(`[catalogue-load] ${f.path}:`, err)
      results.push({ path: f.path, outcome: 'failed', flagged: false, setsNew: 0, setsUpdated: 0, error })
    }
  }
  const delta: Partial<RunCounts> = { folders: results.length, setsNew: 0, setsUpdated: 0 }
  for (const r of results) {
    const key = r.outcome === 'person' ? 'persons' : r.outcome
    delta[key] = (delta[key] ?? 0) + 1
    if (r.flagged) delta.flagged = (delta.flagged ?? 0) + 1
    delta.setsNew! += r.setsNew
    delta.setsUpdated! += r.setsUpdated
  }
  await addCounts(runId, delta)
  return results
}

// ── Finish ───────────────────────────────────────────────────────────────────

/**
 * Close a run. `seenPaths` is every folder the agent found: a folder the app
 * holds that is not among them is gone from the catalogue — marked, never
 * deleted, and her Contact marked with it.
 */
export async function finishRun(runId: string, seenPaths: string[] | null): Promise<RunCounts> {
  let gone = 0
  if (seenPaths) {
    const seen = new Set(seenPaths)
    const held = await prisma.catalogueFolder.findMany({ where: { goneAt: null }, select: { path: true, icgId: true, kind: true } })
    const missing = held.filter((f) => !seen.has(f.path))
    for (const f of missing) {
      await prisma.$transaction(async (tx) => {
        const before = await folderSnapshot(tx, f.path)
        if (before && before.firstRunId !== runId) await snapshot(tx, runId, 'folder', f.path, before)
        await tx.catalogueFolder.update({ where: { path: f.path }, data: { goneAt: new Date(), lastRunId: runId } })
        if (f.kind === 'contact' && f.icgId) {
          const c = await tx.contact.findUnique({ where: { icgId: f.icgId }, select: { id: true, catalogueRunId: true } })
          if (c) {
            if (c.catalogueRunId !== runId) await snapshot(tx, runId, 'contact', c.id, await contactSnapshot(tx, c.id))
            await tx.contact.update({ where: { id: c.id }, data: { goneFromCatalogueAt: new Date() } })
          }
        }
      })
      gone++
    }
  }
  await addCounts(runId, { gone })
  // A pass that changed nothing leaves no entry — the scheduled agent (S7) runs every 15 minutes
  const current = await prisma.catalogueRun.findUniqueOrThrow({ where: { id: runId }, select: { counts: true } })
  const c = current.counts as RunCounts
  if ((c.folders ?? 0) === 0 && (c.gone ?? 0) === 0) {
    await prisma.catalogueRun.delete({ where: { id: runId } })
    return { ...ZERO, ...c }
  }
  const run = await prisma.catalogueRun.update({
    where: { id: runId },
    data: { status: 'DONE', finishedAt: new Date() },
    select: { counts: true },
  })
  return run.counts as RunCounts
}

// ── Undo ─────────────────────────────────────────────────────────────────────

/** A Contact the user has worked with: kept by Undo, only her catalogue fields go back */
const USED_CONTACT_SQL = Prisma.sql`(
  c."nameSetByUser" OR c."portraitKey" IS NOT NULL OR c.note IS NOT NULL OR c."ignoredAt" IS NOT NULL
  OR EXISTS (SELECT 1 FROM "SetCreditRaw" s WHERE s."resolvedContactId" = c.id)
  OR EXISTS (SELECT 1 FROM "ClaimedCollaboration" k WHERE k."counterpartRefId" = c.id)
  OR EXISTS (SELECT 1 FROM "PersonRelationship" r WHERE r."toRefId" = c.id)
  OR EXISTS (SELECT 1 FROM archive_folder_attribution a WHERE a."contactId" = c.id)
)`

export type UndoPreview = {
  runId: string
  contactsRemoved: number
  contactsKept: number
  contactsRestored: number
  setsRemoved: number
  setsRestored: number
  foldersRemoved: number
  foldersRestored: number
}

async function undoableRun(runId: string) {
  const latest = await prisma.catalogueRun.findFirst({
    where: { status: { in: ['DONE', 'FAILED', 'RUNNING'] } },
    orderBy: { startedAt: 'desc' },
    select: { id: true, status: true },
  })
  if (!latest || latest.id !== runId) throw new CatalogueLoadRefused('Only the latest run can be undone — undo the later ones first')
  if (latest.status === 'RUNNING') throw new CatalogueLoadRefused('The run is still running')
}

export async function previewUndo(runId: string): Promise<UndoPreview> {
  await undoableRun(runId)
  const [created, changes, setsRemoved, foldersRemoved] = await Promise.all([
    prisma.$queryRaw<{ used: boolean; n: number }[]>`
      SELECT ${USED_CONTACT_SQL} AS used, count(*)::int AS n FROM "PersonRef" c WHERE c."catalogueRunId" = ${runId} GROUP BY 1`,
    prisma.catalogueRunChange.groupBy({ by: ['entity'], where: { runId }, _count: { _all: true } }),
    prisma.catalogueSet.count({ where: { createdRunId: runId } }),
    prisma.catalogueFolder.count({ where: { firstRunId: runId } }),
  ])
  const changed = (e: string) => changes.find((c) => c.entity === e)?._count._all ?? 0
  return {
    runId,
    contactsRemoved: created.find((r) => !r.used)?.n ?? 0,
    contactsKept: created.find((r) => r.used)?.n ?? 0,
    contactsRestored: changed('contact'),
    setsRemoved,
    setsRestored: changed('set'),
    foldersRemoved,
    foldersRestored: changed('folder'),
  }
}

/**
 * Undo the latest run: everything it brought goes, everything it changed goes
 * back — your work stays. A Contact you used (named, portrait, note, ignored,
 * credited, linked, an archive folder confirmed) is kept and only loses the
 * catalogue fields.
 */
export async function undoRun(runId: string): Promise<UndoPreview> {
  const preview = await previewUndo(runId)
  await prisma.$transaction(
    async (tx) => {
      // Rows the run changed: back to how they were (later runs are already undone)
      const changes = await tx.catalogueRunChange.findMany({ where: { runId } })
      for (const ch of changes.filter((c) => c.entity === 'set')) {
        const b = ch.before as unknown as CatalogueSetRow & { createdRunId: string | null }
        await tx.catalogueSet.update({
          where: { coverId: ch.key },
          data: {
            date: b.date ? new Date(b.date) : null,
            altDates: b.altDates.map((d) => new Date(d)),
            channelName: b.channelName,
            title: b.title,
            isVideo: b.isVideo,
            castIcgIds: b.castIcgIds,
            disagreements: (b.disagreements ?? Prisma.DbNull) as Prisma.InputJsonValue,
            sourceDate: b.sourceDate ? new Date(b.sourceDate) : null,
            createdRunId: b.createdRunId,
          },
        })
      }
      for (const ch of changes.filter((c) => c.entity === 'contact')) {
        const b = ch.before as unknown as Awaited<ReturnType<typeof contactSnapshot>>
        const exists = await tx.contact.findUnique({ where: { id: ch.key }, select: { id: true } })
        if (!exists) continue // developed or deleted since — nothing of hers to put back here
        await tx.contact.update({
          where: { id: ch.key },
          data: {
            name: b.name,
            nameNorm: b.nameNorm,
            catalogueName: b.catalogueName,
            aka: b.aka,
            birthYear: b.birthYear,
            nationality: b.nationality,
            catalogueDate: b.catalogueDate ? new Date(b.catalogueDate) : null,
            goneFromCatalogueAt: b.goneFromCatalogueAt ? new Date(b.goneFromCatalogueAt) : null,
            searchNorm: b.searchNorm,
            catalogueRunId: b.catalogueRunId,
          },
        })
        await tx.contactChannelAlias.deleteMany({ where: { contactId: ch.key } })
        if (b.aliases.length) {
          await tx.contactChannelAlias.createMany({ data: b.aliases.map((a) => ({ ...a, contactId: ch.key })), skipDuplicates: true })
        }
      }
      for (const ch of changes.filter((c) => c.entity === 'folder')) {
        const b = ch.before as unknown as NonNullable<Awaited<ReturnType<typeof folderSnapshot>>>
        const { problems, ...folder } = b
        await tx.catalogueFolder.update({
          where: { path: ch.key },
          data: {
            ...folder,
            newestDate: folder.newestDate ? new Date(folder.newestDate) : null,
            goneAt: folder.goneAt ? new Date(folder.goneAt) : null,
            updatedAt: new Date(folder.updatedAt),
          },
        })
        await tx.catalogueProblem.deleteMany({ where: { folderPath: ch.key } })
        if (problems.length) await tx.catalogueProblem.createMany({ data: problems })
      }

      // Rows the run created: gone — except Contacts you used, which keep you work
      await tx.$executeRaw`DELETE FROM catalogue_set WHERE "createdRunId" = ${runId}`
      await tx.$executeRaw`DELETE FROM "PersonRef" c WHERE c."catalogueRunId" = ${runId} AND NOT ${USED_CONTACT_SQL}`
      const kept = await tx.contact.findMany({ where: { catalogueRunId: runId }, select: { id: true, name: true, icgId: true } })
      for (const c of kept) {
        await tx.contactChannelAlias.deleteMany({ where: { contactId: c.id } })
        await tx.contact.update({
          where: { id: c.id },
          data: {
            catalogueName: null, aka: [], birthYear: null, nationality: null, catalogueDate: null,
            goneFromCatalogueAt: null, catalogueRunId: null,
            searchNorm: buildContactSearchNorm({ name: c.name, icgId: c.icgId }),
          },
        })
      }
      await tx.catalogueFolder.deleteMany({ where: { firstRunId: runId } })
      await tx.catalogueRunChange.deleteMany({ where: { runId } })
      await tx.catalogueRun.update({ where: { id: runId }, data: { status: 'UNDONE', undoneAt: new Date() } })
    },
    { timeout: 30 * 60_000, maxWait: 60_000 },
  )
  return preview
}

// ── Reading ──────────────────────────────────────────────────────────────────

export async function listRuns(limit = 30) {
  const runs = await prisma.catalogueRun.findMany({ orderBy: { startedAt: 'desc' }, take: limit })
  return runs.map((r) => ({ ...r, counts: { ...ZERO, ...(r.counts as RunCounts) } }))
}

export async function getProblemSummary() {
  const rows = await prisma.catalogueProblem.groupBy({ by: ['code'], _count: { _all: true }, orderBy: { code: 'asc' } })
  return rows.map((r) => ({ code: r.code, count: r._count._all }))
}

export async function getProblems(code: string, limit = 500) {
  return prisma.catalogueProblem.findMany({
    where: { code },
    include: { folder: { select: { path: true, name: true, icgId: true, goneAt: true } } },
    orderBy: { folderPath: 'asc' },
    take: limit,
  })
}
