/**
 * One-time backfill: transfer ArchiveFolder.linkedSetId for all PROMOTED staging
 * sets where the folder was linked via StagingSet.archiveFolderId but never
 * migrated to the promoted Set.
 *
 * Usage (dev DB):
 *   npx tsx src/scripts/backfill-promoted-archive-links.ts
 *
 * Usage (prod DB):
 *   DATABASE_URL="..." npx tsx src/scripts/backfill-promoted-archive-links.ts
 */

import 'dotenv/config'
import { backfillPromotedSetArchiveLinks } from '../lib/services/import/staging-set-service'

async function main() {
  const url = process.env.DATABASE_URL ?? '(default)'
  console.log(`Running against: ${url.replace(/:\/\/[^@]+@/, '://***@')}`)
  const result = await backfillPromotedSetArchiveLinks()
  console.log(`Done. Fixed: ${result.fixed}, Snapshot-only: ${result.snapshotOnly}, Skipped: ${result.skipped}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
