/**
 * Repair ImportBatch/StagingSet rows filed under a malformed ICG-ID.
 *
 * The import parser's header loop had no terminator of its own: it ran until the
 * "Other Links" marker or the first `Channel :` / `Titeltxt :`, and when a scrape
 * failed to strip tags at the `Biography :` field the rest of the page landed
 * ahead of those. Every gallery credit on thenude.com is an anchor whose title
 * attribute carries a newline, so lines reading
 *
 *     ICGID: MB-003G" class="model-title">Matilda Bae</a>
 *
 * matched `startsWith('ICGID')` and, under plain assignment, the last one won.
 * The batch and every staging set it created were then filed under an ICG-ID with
 * HTML welded to it. `subjectPersonId` is resolved by exact lookup on that value,
 * so it came out null on every row — and the cover basket, which builds its
 * candidate list from `subjectPersonId OR subjectIcgId`, could match nothing.
 *
 * The parser is fixed (header keys are first-wins). This repairs rows written
 * before that.
 *
 * It never guesses: a malformed value is repaired only when the ICG-ID shape at
 * its head is itself valid AND exactly one Person carries it. Anything else is
 * reported and left alone — a wrong identity key is the failure being repaired,
 * so inventing one here would be the same bug with better manners.
 *
 *   npx tsx scripts/repair-malformed-subject-icgid.ts           # dry run
 *   npx tsx scripts/repair-malformed-subject-icgid.ts --apply
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.production' })

import { ICG_ID_RE } from '../src/lib/icg-id'

const APPLY = process.argv.includes('--apply')

/** The valid ICG-ID at the head of a polluted value, or null. */
function leadingIcgId(value: string): string | null {
  const head = value.match(/^[A-Z]{2}-[0-9]{2}[A-Z0-9@][A-Z0-9]*/)?.[0] ?? null
  return head && ICG_ID_RE.test(head) ? head : null
}

async function main() {
  const { prisma } = await import('../src/lib/db')
  const { runWithTenant } = await import('../src/lib/tenant-context')
  const tenants = (process.env.TENANT_REGISTRY ?? 'pulse').split(',').map((t) => t.trim()).filter(Boolean)

  for (const tenant of tenants) {
    await runWithTenant(tenant, async () => {
      console.log(`\n=== ${tenant} ===`)

      const batches = await prisma.importBatch.findMany({
        select: { id: true, subjectName: true, subjectIcgId: true },
      })
      const malformed = [
        ...new Set(
          batches
            .map((b) => b.subjectIcgId)
            .filter((v): v is string => !!v && !ICG_ID_RE.test(v)),
        ),
      ]

      if (malformed.length === 0) {
        console.log('  nothing to repair')
        return
      }

      for (const bad of malformed) {
        const good = leadingIcgId(bad)
        const owner = good
          ? await prisma.person.findUnique({ where: { icgId: good }, select: { id: true } })
          : null

        const batchCount = await prisma.importBatch.count({ where: { subjectIcgId: bad } })
        const setCount = await prisma.stagingSet.count({ where: { subjectIcgId: bad } })
        const label = batches.find((b) => b.subjectIcgId === bad)?.subjectName ?? '?'

        console.log(`\n  ${label}: ${JSON.stringify(bad)}`)
        console.log(`    → ${good ?? '(no valid ICG-ID at head)'}  batches=${batchCount} stagingSets=${setCount}`)

        if (!good) {
          console.log('    SKIPPED — nothing repairable at the head of this value')
          continue
        }
        if (!owner) {
          console.log(`    SKIPPED — no Person carries ${good}; repair the Person first`)
          continue
        }

        if (!APPLY) {
          console.log(`    would set subjectIcgId=${good}, subjectPersonId=${owner.id}`)
          continue
        }

        await prisma.$transaction(async (tx) => {
          await tx.importBatch.updateMany({
            where: { subjectIcgId: bad },
            data: { subjectIcgId: good },
          })
          // subjectPersonId is derived from subjectIcgId at ingest and was left null
          // by the failed lookup, so it is rewritten here rather than trusted.
          await tx.stagingSet.updateMany({
            where: { subjectIcgId: bad },
            data: { subjectIcgId: good, subjectPersonId: owner.id },
          })
        })
        console.log(`    repaired ${batchCount} batch(es) + ${setCount} staging set(s)`)

        // The covers could not match while the candidate list was empty, and an
        // operator staring at a basket that matches nothing reasonably reaches for
        // "Ignore all pending". Those items are evidence of the bug, not decisions,
        // so they go back to PENDING — matching only ever reads PENDING.
        const revived = await prisma.coverBasketItem.updateMany({
          where: { basket: { personId: owner.id }, status: 'IGNORED' },
          data: { status: 'PENDING' },
        })
        if (revived.count > 0) console.log(`    reset ${revived.count} IGNORED basket item(s) to PENDING`)

        const { runMatchingForPerson } = await import('../src/lib/services/import/cover-basket-service')
        await runMatchingForPerson(owner.id)

        const after = await prisma.coverBasketItem.groupBy({
          by: ['status'],
          _count: { _all: true },
          where: { basket: { personId: owner.id } },
        })
        console.log(`    baskets now: ${after.map((r) => `${r.status}=${r._count._all}`).join(' ')}`)
      }
    })
  }

  if (!APPLY) console.log('\nDry run. Re-run with --apply to write.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
