/**
 * Fill `StagingSet.titleNorm` where it is missing.
 *
 * `createStagingSetFromOrphan` used to leave it null, and
 * `findProbableStagingDuplicate` returns null on an empty one — so a staging set
 * created from an archive folder could never be recognised by a later import of
 * the same set, producing two rows for one real set (ADR-0028). The creation path
 * is fixed; this catches the rows made before that.
 *
 * Dry-run by default. Idempotent: it only ever writes rows that have no value.
 *
 *     npx tsx scripts/backfill-staging-title-norm.ts                  # dev, dry run
 *     npx tsx scripts/backfill-staging-title-norm.ts --apply          # dev, write
 *     npx tsx scripts/backfill-staging-title-norm.ts --prod --apply   # all tenants
 */

import dotenv from 'dotenv'
import { prisma } from '../src/lib/db'
import { runWithTenant } from '../src/lib/tenant-context'
import { normalizeForSearch } from '../src/lib/normalize'

const prod = process.argv.includes('--prod')
const apply = process.argv.includes('--apply')
dotenv.config({ path: prod ? '.env.production' : '.env' })

async function backfill(tenant: string) {
  const rows = await prisma.stagingSet.findMany({
    where: { titleNorm: null },
    select: { id: true, title: true },
  })
  console.log(`\n=== ${tenant} — ${rows.length} staging set(s) without titleNorm ===`)

  let written = 0
  for (const r of rows) {
    const norm = normalizeForSearch(r.title)
    if (!norm) {
      // A title that normalises to nothing cannot serve as a duplicate key at
      // all; writing an empty string would only pretend otherwise.
      console.log(`  skip (title normalises to nothing): ${r.id} "${r.title}"`)
      continue
    }
    console.log(`  ${apply ? 'write' : 'would write'}: "${r.title}" → "${norm}"`)
    if (apply) {
      await prisma.stagingSet.update({ where: { id: r.id }, data: { titleNorm: norm } })
      written++
    }
  }
  if (!apply && rows.length > 0) console.log('  (dry run — pass --apply to write)')
  else if (apply) console.log(`  wrote ${written}`)
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
