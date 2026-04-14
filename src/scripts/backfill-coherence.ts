/**
 * One-time backfill script: populate SetCoherenceSnapshot for all existing data.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-coherence.ts
 */

import 'dotenv/config'
import { backfillCoherenceSnapshots } from '../lib/services/coherence-service'

async function main() {
  console.log('Starting coherence snapshot backfill...')
  const result = await backfillCoherenceSnapshots()
  console.log(`Done. Created: ${result.created}, Updated: ${result.updated}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
