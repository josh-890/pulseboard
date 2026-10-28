#!/usr/bin/env tsx
/**
 * catalogue-proof.ts — size and speed proof for the catalogue load (ADR-0038, S1).
 *
 * Gate before any catalogue data reaches prod: on a full-size copy of the
 * tenant database, fill what the load would bring — every catalogue identity as
 * a Contact with its channel aliases, every catalogue set — and measure what the
 * user agreed must hold: nothing gets slower, search and pickers stay well under
 * half a second, and the space is what the projection said.
 *
 * Identities and aliases are the real ones (from the inventory cache); set rows
 * carry the real CoverIds and the real cast (the union over every file listing
 * the set), with synthetic titles, dates and channels of realistic length — the
 * inventory cache holds no set detail. The real size is measured again on the
 * first load to dev (S3).
 *
 * Usage (DATABASE_URL must point at a scratch database whose name contains "proof"):
 *   DATABASE_URL=postgresql://…/pulseboard_proof npx tsx scripts/catalogue-proof.ts --bench --out before.json
 *   DATABASE_URL=…  npx tsx scripts/catalogue-proof.ts --fill /mnt/c/Users/antar/scripts/inventory.json
 *   DATABASE_URL=…  npx tsx scripts/catalogue-proof.ts --bench --out after.json --compare before.json
 */
import 'dotenv/config'
import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import { prisma } from '../src/lib/db'
import type { Prisma } from '../src/generated/prisma/client'
import { normalizeForSearch } from '../src/lib/normalize'
import { EMPTY_SPEC } from '../src/lib/types/filter-spec'
import { searchPeople } from '../src/lib/services/person-search-service'
import { getContactsPage, getUnlockingContacts } from '../src/lib/services/relationship-service'
import { getStagingSetsFiltered } from '../src/lib/services/import/staging-set-service'
import { getSetsPaginated, getSetById } from '../src/lib/services/set-service'
import { getPersonWithDetails } from '../src/lib/services/person-service'
import { getDashboardStats } from '../src/lib/services/stats-service'
import type { FolderRecord } from '../src/lib/services/catalogue-inventory'

const args = process.argv.slice(2)
const getArg = (flag: string) => {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] ?? null : null
}

const url = process.env.DATABASE_URL ?? ''
const dbName = url.split('/').pop()?.split('?')[0] ?? ''
if (!dbName.includes('proof')) {
  console.error(`Refusing: DATABASE_URL points at "${dbName}" — use a scratch database whose name contains "proof".`)
  process.exit(1)
}

// ── Fill ─────────────────────────────────────────────────────────────────────

const WORDS = ['Morning', 'Light', 'Summer', 'Breeze', 'Red', 'Velvet', 'Golden', 'Hour', 'Secret', 'Garden',
  'Blue', 'Silk', 'Window', 'Seat', 'Presenting', 'Casting', 'Sunset', 'Dream', 'Soft', 'Touch', 'Bedroom',
  'Island', 'Mirror', 'Lace', 'Autumn', 'Leaves', 'City', 'Lights', 'First', 'Time']

function seeded(seed: number) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32)
}

async function fill(inventoryPath: string) {
  const raw = JSON.parse(fs.readFileSync(inventoryPath, 'utf8')) as { records?: FolderRecord[] } | FolderRecord[]
  const records = (Array.isArray(raw) ? raw : raw.records ?? []).filter((r) => r.icgId)
  const byIcg = new Map<string, FolderRecord>()
  for (const r of records) if (!byIcg.has(r.icgId!)) byIcg.set(r.icgId!, r)
  console.log(`${byIcg.size.toLocaleString()} catalogue identities`)

  const persons = new Set((await prisma.person.findMany({ select: { icgId: true } })).map((p) => p.icgId))
  const contacts = new Map(
    (await prisma.contact.findMany({ where: { icgId: { not: null } }, select: { id: true, icgId: true } })).map((c) => [c.icgId!, c.id]),
  )
  const rnd = seeded(38)
  const NATIONS = ['UKR', 'RUS', 'CZE', 'HUN', 'USA', 'GBR', 'FRA', 'ESP', 'ITA', 'BRA', 'ROU', 'POL', 'SVK', 'LAT']

  // Contacts: new ones created, existing ones enriched; Persons are never touched (ADR-0038 §2)
  let created = 0
  let enriched = 0
  const contactIdOf = new Map<string, string>()
  const toCreate: Prisma.ContactCreateManyInput[] = []
  for (const [icg, r] of byIcg) {
    if (persons.has(icg)) continue
    const aliasNames = r.aliases.map((a) => a.slice(a.indexOf('|') + 1))
    const searchNorm = normalizeForSearch([r.name, ...aliasNames, icg].join(' '))
    const fields = {
      catalogueName: r.name,
      birthYear: 1975 + Math.floor(rnd() * 30),
      nationality: NATIONS[Math.floor(rnd() * NATIONS.length)],
      catalogueDate: r.newestDate ? new Date(r.newestDate) : null,
      searchNorm,
    }
    const existing = contacts.get(icg)
    if (existing?.startsWith('proof_')) {
      contactIdOf.set(icg, existing) // an earlier, interrupted fill — resumable
    } else if (existing) {
      await prisma.contact.update({ where: { id: existing }, data: fields })
      contactIdOf.set(icg, existing)
      enriched++
    } else {
      const id = `proof_${icg}`
      toCreate.push({ id, icgId: icg, name: r.name, nameNorm: normalizeForSearch(r.name), ...fields })
      contactIdOf.set(icg, id)
    }
  }
  for (let i = 0; i < toCreate.length; i += 2000) {
    created += (await prisma.contact.createMany({ data: toCreate.slice(i, i + 2000), skipDuplicates: true })).count
  }
  console.log(`contacts: ${created.toLocaleString()} created, ${enriched.toLocaleString()} enriched`)

  let aliases = 0
  const aliasRows: { contactId: string; channelName: string; alias: string; aliasNorm: string }[] = []
  for (const [icg, r] of byIcg) {
    const contactId = contactIdOf.get(icg)
    if (!contactId) continue
    for (const a of r.aliases) {
      const bar = a.indexOf('|')
      const alias = a.slice(bar + 1)
      aliasRows.push({ contactId, channelName: a.slice(0, bar), alias, aliasNorm: normalizeForSearch(alias) })
    }
  }
  for (let i = 0; i < aliasRows.length; i += 5000) {
    aliases += (await prisma.contactChannelAlias.createMany({ data: aliasRows.slice(i, i + 5000), skipDuplicates: true })).count
  }
  console.log(`channel aliases: ${aliases.toLocaleString()}`)

  // Sets: one row per CoverId, cast = union over every file listing it
  const castOf = new Map<string, Set<string>>()
  const channelOf = new Map<string, string>()
  for (const [icg, r] of byIcg) {
    const channels = [...new Set(r.aliases.map((a) => a.slice(0, a.indexOf('|'))))]
    for (const id of r.setIds) {
      let cast = castOf.get(id)
      if (!cast) castOf.set(id, (cast = new Set()))
      cast.add(icg)
      if (!channelOf.has(id)) channelOf.set(id, channels.length ? channels[Math.floor(rnd() * channels.length)] : 'UNKNOWN CHANNEL')
    }
  }
  const DAY = 86_400_000
  const START = Date.UTC(2000, 0, 1)
  let sets = 0
  let batch: { coverId: string; date: Date | null; altDates: Date[]; channelName: string; title: string; isVideo: boolean; castIcgIds: string[] }[] = []
  const flush = async () => {
    if (!batch.length) return
    sets += (await prisma.catalogueSet.createMany({ data: batch, skipDuplicates: true })).count
    batch = []
    process.stdout.write(`\r  sets ${sets.toLocaleString()}`)
  }
  for (const [coverId, cast] of castOf) {
    const words = 1 + Math.floor(rnd() * 4)
    const title = Array.from({ length: words }, () => WORDS[Math.floor(rnd() * WORDS.length)]).join(' ')
    const date = rnd() < 0.03 ? null : new Date(START + Math.floor(rnd() * 26 * 365) * DAY)
    const altDates = date && rnd() < 0.02 ? [new Date(date.getTime() + DAY)] : []
    batch.push({ coverId, date, altDates, channelName: channelOf.get(coverId)!, title, isVideo: rnd() < 0.3, castIcgIds: [...cast] })
    if (batch.length >= 5000) await flush()
  }
  await flush()
  console.log(`\ncatalogue sets: ${sets.toLocaleString()}`)
  await prisma.$executeRawUnsafe('VACUUM ANALYZE "PersonRef"')
  await prisma.$executeRawUnsafe('VACUUM ANALYZE contact_channel_alias')
  await prisma.$executeRawUnsafe('VACUUM ANALYZE catalogue_set')
}

// ── Bench ────────────────────────────────────────────────────────────────────

type Result = { name: string; median: number; p95: number; runs: number }

async function time(name: string, fn: () => Promise<unknown>, runs = 15): Promise<Result> {
  for (let i = 0; i < 3; i++) await fn()
  const ms: number[] = []
  for (let i = 0; i < runs; i++) {
    const t = performance.now()
    await fn()
    ms.push(performance.now() - t)
  }
  ms.sort((a, b) => a - b)
  const r = { name, median: ms[Math.floor(runs / 2)], p95: ms[Math.min(runs - 1, Math.ceil(runs * 0.95) - 1)], runs }
  console.log(`  ${name.padEnd(46)} median ${r.median.toFixed(1).padStart(7)} ms   p95 ${r.p95.toFixed(1).padStart(7)} ms`)
  return r
}

/** The contact search S2 will run: trigram on one normalised string, Persons searched as today */
async function contactSearch(q: string) {
  const norm = normalizeForSearch(q)
  return prisma.$queryRaw`
    SELECT id, name, "icgId", "birthYear", nationality
    FROM "PersonRef"
    WHERE "ignoredAt" IS NULL AND "searchNorm" ILIKE ${'%' + norm + '%'}
    ORDER BY ("searchNorm" ILIKE ${norm + '%'}) DESC, similarity("searchNorm", ${norm}) DESC
    LIMIT 20`
}

async function personPicker(q: string) {
  return prisma.person.findMany({
    where: {
      OR: [
        { icgId: { contains: q, mode: 'insensitive' } },
        { aliases: { some: { name: { contains: q, mode: 'insensitive' } } } },
      ],
    },
    select: { id: true, icgId: true, aliases: { where: { isCommon: true }, select: { name: true } } },
    take: 20,
  })
}

async function bench(): Promise<Result[]> {
  const person = await prisma.person.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } })
  const set = await prisma.set.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } })
  const hasCatalogue = (await prisma.catalogueSet.count()) > 0
  const dates = hasCatalogue
    ? (await prisma.$queryRaw<{ d: Date }[]>`SELECT date AS d FROM catalogue_set WHERE date IS NOT NULL ORDER BY md5("coverId") LIMIT 200`).map((r) => r.d)
    : []
  const someIcg = hasCatalogue
    ? (await prisma.$queryRaw<{ i: string }[]>`SELECT "castIcgIds"[1] AS i FROM catalogue_set ORDER BY md5("coverId") LIMIT 50`).map((r) => r.i)
    : []
  const QUERIES = ['sunny', 'anna y', 'lexi', 'ay-006s', 'kat', 'metart']

  console.log(`Bench on ${dbName}${hasCatalogue ? ' (with catalogue)' : ''}`)
  const results: Result[] = []
  // Pages that must not get slower
  results.push(await time('dashboard stats', () => getDashboardStats()))
  results.push(await time('/people first page', () => searchPeople(EMPTY_SPEC, { limit: 50 })))
  if (person) results.push(await time('person page (details)', () => getPersonWithDetails(person.id)))
  results.push(await time('/sets first page', () => getSetsPaginated({}, undefined, 50)))
  if (set) results.push(await time('set page', () => getSetById(set.id)))
  results.push(await time('/staging-sets first page', () => getStagingSetsFiltered({ limit: 200 } as Parameters<typeof getStagingSetsFiltered>[0])))
  results.push(await time('person picker (6 queries)', async () => {
    for (const q of QUERIES) await personPicker(q)
  }))
  // Where Contacts appear
  results.push(await time('contacts register: unlocking head', () => getUnlockingContacts({})))
  results.push(await time('contacts register: first page', () => getContactsPage({ offset: 0, limit: 50 })))
  results.push(await time('contacts register: search "anna"', () => getContactsPage({ q: 'anna', offset: 0, limit: 50 })))
  results.push(await time('contact search, S2 query (6 queries)', async () => {
    for (const q of QUERIES) await contactSearch(q)
  }))
  if (hasCatalogue) {
    results.push(await time('archive match: sets on 200 dates ±', async () => {
      for (const d of dates) {
        const around = [-1, 0, 1].map((k) => new Date(d.getTime() + k * 86_400_000))
        await prisma.$queryRaw`SELECT "coverId", title, "channelName", "castIcgIds" FROM catalogue_set WHERE date = ANY(${around}::date[])`
      }
    }, 5))
    results.push(await time('her sets (50 contacts)', async () => {
      for (const i of someIcg) await prisma.$queryRaw`SELECT "coverId" FROM catalogue_set WHERE "castIcgIds" @> ARRAY[${i}]::text[]`
    }, 5))
  }
  return results
}

async function sizes() {
  const rows = await prisma.$queryRaw<{ name: string; bytes: bigint }[]>`
    SELECT 'database' AS name, pg_database_size(current_database()) AS bytes
    UNION ALL SELECT 'PersonRef (Contacts)', pg_total_relation_size('"PersonRef"')
    UNION ALL SELECT 'contact_channel_alias', pg_total_relation_size('contact_channel_alias')
    UNION ALL SELECT 'catalogue_set', pg_total_relation_size('catalogue_set')`
  const counts = await prisma.$queryRaw<{ contacts: bigint; aliases: bigint; sets: bigint }[]>`
    SELECT (SELECT count(*) FROM "PersonRef") AS contacts, (SELECT count(*) FROM contact_channel_alias) AS aliases,
           (SELECT count(*) FROM catalogue_set) AS sets`
  const mb = (b: bigint) => `${(Number(b) / 1024 / 1024).toFixed(1)} MB`
  for (const r of rows) console.log(`  ${r.name.padEnd(24)} ${mb(r.bytes)}`)
  const c = counts[0]
  console.log(`  rows: ${c.contacts} contacts, ${c.aliases} aliases, ${c.sets} sets`)
  return { sizes: Object.fromEntries(rows.map((r) => [r.name, Number(r.bytes)])), counts: { contacts: Number(c.contacts), aliases: Number(c.aliases), sets: Number(c.sets) } }
}

async function main() {
  const fillPath = getArg('--fill')
  if (fillPath) await fill(fillPath)
  if (args.includes('--bench')) {
    const results = await bench()
    console.log('Sizes')
    const size = await sizes()
    const out = getArg('--out')
    if (out) fs.writeFileSync(out, JSON.stringify({ results, ...size }, null, 2))
    const cmp = getArg('--compare')
    if (cmp) {
      const before = JSON.parse(fs.readFileSync(cmp, 'utf8')) as { results: Result[]; sizes: Record<string, number> }
      console.log('\nBefore → after (median)')
      for (const r of results) {
        const b = before.results.find((x) => x.name === r.name)
        if (!b) continue
        const change = ((r.median - b.median) / b.median) * 100
        console.log(`  ${r.name.padEnd(46)} ${b.median.toFixed(1).padStart(7)} → ${r.median.toFixed(1).padStart(7)} ms  (${change >= 0 ? '+' : ''}${change.toFixed(0)} %)`)
      }
      const grew = size.sizes.database - before.sizes.database
      console.log(`  database grew ${(grew / 1024 / 1024).toFixed(1)} MB`)
    }
  }
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
