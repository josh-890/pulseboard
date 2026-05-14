/**
 * Backfill: split combined alias names containing " & " into individual aliases.
 *
 * Bug: the import parser stored "Alias1 & Alias2 & Alias3" as a single PersonAlias
 * name instead of three separate aliases each linked to the channel.
 *
 * This script:
 *   1. Finds all PersonAlias records where name contains " & "
 *   2. Reports what it found (dry run by default)
 *   3. For each combined alias:
 *      a. Splits into individual names
 *      b. Creates any missing individual aliases (source=IMPORT, linked to same channels)
 *      c. Re-points any resolvedAliasId FK references to the first matching individual alias
 *      d. Deletes the combined alias record
 *
 * Usage:
 *   npx tsx scripts/backfill-split-combined-aliases.ts            # dry run (dev DB)
 *   npx tsx scripts/backfill-split-combined-aliases.ts --apply    # apply (dev DB)
 *   DATABASE_URL=<url> npx tsx scripts/backfill-split-combined-aliases.ts --apply
 */

import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL!
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

const DRY_RUN = !process.argv.includes('--apply')

function normalizeForSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

async function main() {
  console.log(`DB: ${connectionString.replace(/:[^:@]+@/, ':***@')}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (pass --apply to execute)' : 'APPLY'}`)
  console.log('')

  // Find all combined aliases
  const combinedAliases = await prisma.personAlias.findMany({
    where: { name: { contains: ' & ' } },
    include: {
      channelLinks: {
        include: { channel: { select: { id: true, name: true } } },
      },
      _count: { select: { creditUsages: true, sessionUsages: true } },
      person: {
        select: {
          icgId: true,
          aliases: { where: { isCommon: true }, take: 1, select: { name: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  console.log(`Found ${combinedAliases.length} combined alias records containing " & "`)
  console.log('')

  if (combinedAliases.length === 0) {
    console.log('Nothing to do.')
    return
  }

  let totalCreated = 0
  let totalAlreadyExisted = 0
  let totalChannelLinksAdded = 0
  let totalFkRepointed = 0
  let totalDeleted = 0

  for (const combined of combinedAliases) {
    const personDisplay = combined.person.aliases[0]?.name ?? combined.person.icgId
    const parts = combined.name.split(/\s*&\s*/).map(s => s.trim()).filter(Boolean)
    const channelNames = combined.channelLinks.map(l => l.channel.name)
    const channelIds = combined.channelLinks.map(l => l.channel.id)

    console.log(`  Person: ${personDisplay}`)
    console.log(`  Combined name: "${combined.name}"`)
    console.log(`  → Parts: ${parts.map(p => `"${p}"`).join(', ')}`)
    console.log(`  Channels: ${channelNames.length > 0 ? channelNames.join(', ') : '(none)'}`)
    console.log(`  Credit usages: ${combined._count.creditUsages}, Session usages: ${combined._count.sessionUsages}`)
    if (combined.isCommon) console.log('  ⚠ WARNING: isCommon=true — will NOT delete, needs manual review')
    if (combined.isBirth) console.log('  ⚠ WARNING: isBirth=true — will NOT delete, needs manual review')
    console.log('')

    if (DRY_RUN) continue
    if (combined.isCommon || combined.isBirth) {
      console.log('  → SKIPPED (isCommon or isBirth — manual review needed)')
      console.log('')
      continue
    }

    await prisma.$transaction(async (tx) => {
      const resolvedAliasIds: string[] = []

      for (const part of parts) {
        const nameNorm = normalizeForSearch(part)

        // Check if this individual alias already exists for this person
        const existing = await tx.personAlias.findFirst({
          where: { personId: combined.personId, nameNorm },
          select: { id: true },
        })

        let aliasId: string
        if (existing) {
          aliasId = existing.id
          totalAlreadyExisted++
          console.log(`    "${part}" → already exists (id: ${aliasId})`)
        } else {
          const newAlias = await tx.personAlias.create({
            data: {
              personId: combined.personId,
              name: part,
              nameNorm,
              isCommon: false,
              isBirth: false,
              source: 'IMPORT',
              notes: combined.notes,
            },
          })
          aliasId = newAlias.id
          totalCreated++
          console.log(`    "${part}" → created (id: ${aliasId})`)
        }

        // Link to all channels from the combined alias (skipDuplicates handles existing links)
        if (channelIds.length > 0) {
          const result = await tx.personAliasChannel.createMany({
            data: channelIds.map(channelId => ({ aliasId, channelId })),
            skipDuplicates: true,
          })
          totalChannelLinksAdded += result.count
          if (result.count > 0) console.log(`      → linked to ${result.count} channel(s)`)
        }

        resolvedAliasIds.push(aliasId)
      }

      // Re-point SetCreditRaw.resolvedAliasId from combined → first individual alias
      if (combined._count.creditUsages > 0 && resolvedAliasIds.length > 0) {
        const updated = await tx.setCreditRaw.updateMany({
          where: { resolvedAliasId: combined.id },
          data: { resolvedAliasId: resolvedAliasIds[0] },
        })
        totalFkRepointed += updated.count
        console.log(`    → re-pointed ${updated.count} SetCreditRaw FK(s) to "${parts[0]}"`)
      }

      // Re-point SessionContribution.resolvedAliasId from combined → first individual alias
      if (combined._count.sessionUsages > 0 && resolvedAliasIds.length > 0) {
        const updated = await tx.sessionContribution.updateMany({
          where: { resolvedAliasId: combined.id },
          data: { resolvedAliasId: resolvedAliasIds[0] },
        })
        totalFkRepointed += updated.count
        console.log(`    → re-pointed ${updated.count} SessionContribution FK(s) to "${parts[0]}"`)
      }

      // Delete channel links on combined alias
      await tx.personAliasChannel.deleteMany({ where: { aliasId: combined.id } })

      // Delete the combined alias itself
      await tx.personAlias.delete({ where: { id: combined.id } })
      totalDeleted++
      console.log(`    → deleted combined alias`)
    })

    console.log('')
  }

  if (!DRY_RUN) {
    console.log('─'.repeat(50))
    console.log(`Created:          ${totalCreated}`)
    console.log(`Already existed:  ${totalAlreadyExisted}`)
    console.log(`Channel links:    ${totalChannelLinksAdded}`)
    console.log(`FKs re-pointed:   ${totalFkRepointed}`)
    console.log(`Deleted combined: ${totalDeleted}`)
    console.log('')
    console.log('Done.')
  } else {
    console.log('(Dry run — no changes made. Pass --apply to execute.)')
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
