/**
 * Backfill all *Norm fields using proper normalizeForSearch().
 *
 * Fixes existing records that used .toLowerCase() only (missing NFD +
 * diacritics strip). Also populates null titleNorm on Sets.
 *
 * Safe to run multiple times — idempotent.
 *
 * Usage: npx tsx scripts/backfill-norms.ts
 */

import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL!
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

async function backfillTable(
  label: string,
  findMany: () => Promise<Array<{ id: string; [key: string]: unknown }>>,
  getFields: (row: Record<string, unknown>) => Record<string, string | null>,
  update: (id: string, data: Record<string, string | null>) => Promise<unknown>,
) {
  const rows = await findMany()
  let updated = 0

  for (const row of rows) {
    const fields = getFields(row as Record<string, unknown>)
    const changes: Record<string, string | null> = {}

    for (const [field, newValue] of Object.entries(fields)) {
      const current = (row as Record<string, unknown>)[field] as string | null
      if (current !== newValue) {
        changes[field] = newValue
      }
    }

    if (Object.keys(changes).length > 0) {
      await update(row.id, changes)
      updated++
    }
  }

  console.log(`  ${label}: ${updated}/${rows.length} updated`)
  return updated
}

async function main() {
  console.log('Backfilling normalized fields...\n')
  let total = 0

  // Sets — titleNorm
  total += await backfillTable(
    'Set.titleNorm',
    () => prisma.set.findMany({ select: { id: true, title: true, titleNorm: true } }),
    (row) => ({ titleNorm: normalizeForSearch(row.title as string) }),
    (id, data) => prisma.set.update({ where: { id }, data }),
  )

  // Sessions — nameNorm
  total += await backfillTable(
    'Session.nameNorm',
    () => prisma.session.findMany({ select: { id: true, name: true, nameNorm: true } }),
    (row) => ({ nameNorm: normalizeForSearch(row.name as string) }),
    (id, data) => prisma.session.update({ where: { id }, data }),
  )

  // Channels — nameNorm
  total += await backfillTable(
    'Channel.nameNorm',
    () => prisma.channel.findMany({ select: { id: true, name: true, nameNorm: true } }),
    (row) => ({ nameNorm: normalizeForSearch(row.name as string) }),
    (id, data) => prisma.channel.update({ where: { id }, data }),
  )

  // Labels — nameNorm
  total += await backfillTable(
    'Label.nameNorm',
    () => prisma.label.findMany({ select: { id: true, name: true, nameNorm: true } }),
    (row) => ({ nameNorm: normalizeForSearch(row.name as string) }),
    (id, data) => prisma.label.update({ where: { id }, data }),
  )

  // Networks — nameNorm
  total += await backfillTable(
    'Network.nameNorm',
    () => prisma.network.findMany({ select: { id: true, name: true, nameNorm: true } }),
    (row) => ({ nameNorm: normalizeForSearch(row.name as string) }),
    (id, data) => prisma.network.update({ where: { id }, data }),
  )

  // Projects — nameNorm
  total += await backfillTable(
    'Project.nameNorm',
    () => prisma.project.findMany({ select: { id: true, name: true, nameNorm: true } }),
    (row) => ({ nameNorm: normalizeForSearch(row.name as string) }),
    (id, data) => prisma.project.update({ where: { id }, data }),
  )

  // PersonAliases — nameNorm
  total += await backfillTable(
    'PersonAlias.nameNorm',
    () => prisma.personAlias.findMany({ select: { id: true, name: true, nameNorm: true } }),
    (row) => ({ nameNorm: normalizeForSearch(row.name as string) }),
    (id, data) => prisma.personAlias.update({ where: { id }, data }),
  )

  // SetCreditRaw — nameNorm
  total += await backfillTable(
    'SetCreditRaw.nameNorm',
    () => prisma.setCreditRaw.findMany({ select: { id: true, rawName: true, nameNorm: true } }),
    (row) => ({ nameNorm: normalizeForSearch(row.rawName as string) }),
    (id, data) => prisma.setCreditRaw.update({ where: { id }, data }),
  )

  // StagingSets — titleNorm, artistNorm
  total += await backfillTable(
    'StagingSet.titleNorm+artistNorm',
    () => prisma.stagingSet.findMany({
      select: { id: true, title: true, titleNorm: true, artist: true, artistNorm: true },
    }),
    (row) => ({
      titleNorm: normalizeForSearch(row.title as string),
      artistNorm: row.artist ? normalizeForSearch(row.artist as string) : null,
    }),
    (id, data) => prisma.stagingSet.update({ where: { id }, data }),
  )

  console.log(`\nDone. Total records updated: ${total}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
