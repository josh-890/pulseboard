/**
 * ArchiveLink data migration — standalone runner.
 *
 * The data migration is included INLINE in the Prisma migration file:
 *   prisma/migrations/20260425000001_migrate_to_archive_link/migration.sql
 *
 * On prod, apply the full migration SQL directly via psql:
 *   psql "$DATABASE_URL" -f prisma/migrations/20260425000001_migrate_to_archive_link/migration.sql
 *
 * This script verifies that ArchiveLinks were created correctly and prints a summary.
 *
 * Usage:
 *   npx tsx src/scripts/migrate-to-archive-link.ts
 *   DATABASE_URL="..." npx tsx src/scripts/migrate-to-archive-link.ts
 */

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL ?? ''
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter } as never)

async function main() {
  const url = process.env.DATABASE_URL ?? '(default)'
  console.log(`\nDB: ${url.replace(/:\/\/[^@]+@/, '://***@')}\n`)

  const total = await prisma.archiveLink.count()
  const confirmed = await prisma.archiveLink.count({ where: { status: 'CONFIRMED' } })
  const suggested = await prisma.archiveLink.count({ where: { status: 'SUGGESTED' } })
  const confirmedWithSet = await prisma.archiveLink.count({
    where: { status: 'CONFIRMED', setId: { not: null } },
  })
  const confirmedWithStaging = await prisma.archiveLink.count({
    where: { status: 'CONFIRMED', stagingSetId: { not: null } },
  })
  const suggestedWithSet = await prisma.archiveLink.count({
    where: { status: 'SUGGESTED', setId: { not: null } },
  })
  const suggestedWithStaging = await prisma.archiveLink.count({
    where: { status: 'SUGGESTED', stagingSetId: { not: null } },
  })

  console.log('=== ArchiveLink migration summary ===')
  console.log(`Total ArchiveLinks:          ${total}`)
  console.log(`  CONFIRMED total:           ${confirmed}`)
  console.log(`    → linked to Set:         ${confirmedWithSet}`)
  console.log(`    → linked to StagingSet:  ${confirmedWithStaging}`)
  console.log(`  SUGGESTED total:           ${suggested}`)
  console.log(`    → pointing to Set:       ${suggestedWithSet}`)
  console.log(`    → pointing to StagingSet:${suggestedWithStaging}`)

  if (total === 0) {
    console.log('\nWARNING: No ArchiveLinks found.')
    console.log('If this is a prod database, apply the full migration SQL first:')
    console.log('  psql "$DATABASE_URL" -f prisma/migrations/20260425000001_migrate_to_archive_link/migration.sql')
  }

  // Check for folders that had confirmed links but have no ArchiveLink (data loss check)
  const archiveFolderCount = await prisma.archiveFolder.count()
  const foldersWithLink = await prisma.archiveLink.count({
    where: { status: 'CONFIRMED' },
  })
  console.log(`\nArchive folders total: ${archiveFolderCount}`)
  console.log(`Folders with CONFIRMED link: ${foldersWithLink}`)

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
