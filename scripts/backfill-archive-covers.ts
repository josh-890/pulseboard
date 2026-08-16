/**
 * Give sets born from the archive the cover that was there all along.
 *
 * A staging set developed from an archive folder never had a publisher's image, so
 * its `coverImageUrl` stayed empty — while the folder's own cover sat in MinIO,
 * uploaded by `archive-cover.ps1`. Nothing connected the two, so the staging row
 * showed a grey box and, worse, promotion had nothing to carry across:
 * `transferStagingCoverToSet` only runs when the staging set has a cover of its own.
 *
 * `createStagingSetFromOrphan` now writes it at the source. This repairs the ones
 * developed before that, and hands the cover on to any Set they were promoted into.
 *
 * Dry-run by default. Idempotent: it only ever fills what is empty, and the transfer
 * itself skips a Set that already has a cover.
 *
 *     npx tsx scripts/backfill-archive-covers.ts                  # dev, dry run
 *     npx tsx scripts/backfill-archive-covers.ts --apply          # dev, write
 *     npx tsx scripts/backfill-archive-covers.ts --prod --apply   # all tenants
 */

import dotenv from 'dotenv'
import { prisma } from '../src/lib/db'
import { runWithTenant } from '../src/lib/tenant-context'
import { buildUrl } from '../src/lib/media-url'
import { transferStagingCoverToSet } from '../src/lib/services/import/cover-transfer'

const prod = process.argv.includes('--prod')
const apply = process.argv.includes('--apply')
dotenv.config({ path: prod ? '.env.production' : '.env' })

async function backfill(tenant: string) {
  // Promotion moves the archive link from the StagingSet to the Set, so a promoted
  // row has no archiveLinks of its own — looking only there finds none of exactly
  // the sets that need this most (CONTEXT.md, "Staged set vs. Set").
  const linkWithCover = { status: 'CONFIRMED', archiveFolder: { coverKey: { not: null } } } as const
  const candidates = await prisma.stagingSet.findMany({
    where: {
      coverImageUrl: null,
      OR: [
        { archiveLinks: { some: linkWithCover } },
        { promotedSet: { archiveLinks: { some: linkWithCover } } },
      ],
    },
    select: {
      id: true,
      title: true,
      status: true,
      promotedSetId: true,
      archiveLinks: {
        where: { status: 'CONFIRMED' },
        select: { archiveFolder: { select: { coverKey: true } } },
      },
      promotedSet: {
        select: {
          archiveLinks: {
            where: { status: 'CONFIRMED' },
            select: { archiveFolder: { select: { coverKey: true } } },
          },
        },
      },
    },
  })

  console.log(`\n=== ${tenant} — ${candidates.length} staging set(s) without a cover of their own ===`)

  let filled = 0
  let handedOn = 0
  for (const s of candidates) {
    const links = [...(s.promotedSet?.archiveLinks ?? []), ...s.archiveLinks]
    const key = links.find((l) => l.archiveFolder?.coverKey)?.archiveFolder?.coverKey
    if (!key) continue
    const url = buildUrl(key)
    console.log(`  ${apply ? 'fill' : 'would fill'}  "${s.title}"${s.promotedSetId ? '  → and hand on to its Set' : ''}`)
    if (!apply) continue

    await prisma.stagingSet.update({ where: { id: s.id }, data: { coverImageUrl: url } })
    filled++

    // A Set promoted before this ran may have no cover either. The transfer skips
    // one that already has a cover — rightly: a cover from an upload is the real
    // thing and an archive thumbnail must not overwrite it.
    //
    // It reports nothing, so the effect is read from the Set itself. Counting calls
    // instead of effects made this script claim it had handed covers to four Sets
    // that all already had one.
    if (s.promotedSetId) {
      const before = await prisma.set.findUnique({
        where: { id: s.promotedSetId },
        select: { coverMediaItemId: true },
      })
      if (before?.coverMediaItemId) {
        console.log('    Set already has a cover — left alone')
        continue
      }
      try {
        await transferStagingCoverToSet(url, s.promotedSetId)
        const after = await prisma.set.findUnique({
          where: { id: s.promotedSetId },
          select: { coverMediaItemId: true },
        })
        if (after?.coverMediaItemId) handedOn++
        else console.log('    transfer did nothing (no primary session yet)')
      } catch (err) {
        console.warn(`    transfer failed for ${s.title}:`, err)
      }
    }
  }

  if (!apply && candidates.length > 0) console.log('  (dry run — pass --apply to write)')
  else if (apply) console.log(`  filled ${filled} staging cover(s); ${handedOn} Set(s) actually gained one`)
}

async function main() {
  if (!prod) return backfill('dev')
  const tenants = (process.env.TENANT_REGISTRY ?? 'pulse').split(',').map((t) => t.trim()).filter(Boolean)
  for (const tenant of tenants) await runWithTenant(tenant, () => backfill(tenant))
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .then(() => process.exit(0))
