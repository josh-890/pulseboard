/**
 * Recompute probable staging-duplicate flags under the type-aware rule.
 *
 * Background: the "POSSIBLE DUP" detector used to match on channel + release date
 * only, so a photo set and a video set of one session (split siblings) wrongly
 * flagged each other. The fix scopes the match by SetType (`isVideo`). This script
 * re-derives `isDuplicate` for existing PROBABLE duplicates and clears the
 * now-false ones.
 *
 * Scope: only PROBABLE duplicates (`duplicateGroupId IS NULL`) — user-confirmed
 * groups (with a groupId) are left untouched. A set keeps `isDuplicate=true` only
 * if a non-skipped counterpart exists with the SAME channel + release date +
 * isVideo and a different externalId.
 *
 * Read-only except for clearing false flags. Run per tenant:
 *   DATABASE_URL=... npx tsx scripts/recompute-staging-duplicate-flags.ts
 * Add --apply to write; without it, dry-run (reports only).
 */

import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const apply = process.argv.includes('--apply')
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

async function main() {
  const flagged = await prisma.stagingSet.findMany({
    where: { isDuplicate: true, duplicateGroupId: null },
    select: { id: true, channelId: true, releaseDate: true, isVideo: true, externalId: true, title: true, status: true },
  })

  const toClear: { id: string; title: string; isVideo: boolean }[] = []
  for (const s of flagged) {
    if (!s.channelId || !s.releaseDate) {
      toClear.push({ id: s.id, title: s.title, isVideo: s.isVideo })
      continue
    }
    const counterpart = await prisma.stagingSet.findFirst({
      where: {
        channelId: s.channelId,
        releaseDate: s.releaseDate,
        isVideo: s.isVideo,
        id: { not: s.id },
        status: { not: 'SKIPPED' },
        ...(s.externalId ? { externalId: { not: s.externalId } } : {}),
      },
      select: { id: true },
    })
    if (!counterpart) toClear.push({ id: s.id, title: s.title, isVideo: s.isVideo })
  }

  console.log(`PROBABLE-flagged staging sets: ${flagged.length} | false (no same-type counterpart): ${toClear.length}`)
  for (const c of toClear) console.log(`  clear  [${c.isVideo ? 'video' : 'photo'}]  ${c.title}`)

  if (apply && toClear.length > 0) {
    await prisma.stagingSet.updateMany({
      where: { id: { in: toClear.map((c) => c.id) } },
      data: { isDuplicate: false },
    })
    console.log(`Applied: cleared ${toClear.length} false flag(s).`)
  } else if (!apply) {
    console.log('(dry-run — re-run with --apply to clear)')
  }
}

main().finally(() => prisma.$disconnect())
