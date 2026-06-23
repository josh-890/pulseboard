/**
 * Backfill notes onto promoted Sets that lost them before the carry-over fix.
 *
 * promoteManualStagingSet used not to copy StagingSet.notes onto the promoted Set.
 * This script copies the note from each PROMOTED StagingSet (status='PROMOTED',
 * non-empty notes, linked via promotedSetId) onto its Set when the Set has no notes
 * yet — mirroring the fix's backfill-when-empty semantics. Never overwrites.
 *
 * Run per tenant; dry-run by default, --apply to write:
 *   DATABASE_URL=... npx tsx scripts/backfill-promoted-set-notes.ts [--apply]
 */

import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const apply = process.argv.includes('--apply')
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

async function main() {
  const promoted = await prisma.stagingSet.findMany({
    where: { status: 'PROMOTED', promotedSetId: { not: null }, NOT: { notes: null } },
    select: { id: true, title: true, notes: true, promotedSetId: true },
  })

  const toFill: { setId: string; title: string; notes: string }[] = []
  for (const s of promoted) {
    if (!s.notes || s.notes.trim() === '') continue
    const set = await prisma.set.findUnique({ where: { id: s.promotedSetId! }, select: { id: true, notes: true } })
    if (!set) continue
    if (set.notes && set.notes.trim() !== '') continue // never overwrite
    toFill.push({ setId: set.id, title: s.title, notes: s.notes })
  }

  console.log(`PROMOTED staging sets with notes: ${promoted.length} | sets missing notes (to fill): ${toFill.length}`)
  for (const f of toFill) console.log(`  fill  "${f.title}"  ← ${JSON.stringify(f.notes.slice(0, 80))}`)

  if (apply) {
    for (const f of toFill) {
      await prisma.set.update({ where: { id: f.setId }, data: { notes: f.notes } })
    }
    console.log(`Applied: filled ${toFill.length} set(s).`)
  } else {
    console.log('(dry-run — re-run with --apply to write)')
  }
}

main().finally(() => prisma.$disconnect())
