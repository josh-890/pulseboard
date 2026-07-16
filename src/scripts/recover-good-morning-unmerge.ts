/**
 * One-off recovery: un-merge the 2026-07-14 cross-label mis-merge on xpulse.
 *
 * A staged set ("Good Morning", AmourAngels) was wrongly enriched INTO an
 * unrelated existing Set ("Set 1", EuroNudes/Aphroditas). This reverts Nella's
 * set to its verified pre-merge state and re-stages Good Morning for a clean
 * re-promote (the promote-guard fix is already deployed).
 *
 * Dry-run by default (no writes). Add --apply to execute.
 *
 * Usage:
 *   npx tsx src/scripts/recover-good-morning-unmerge.ts            # dry-run
 *   npx tsx src/scripts/recover-good-morning-unmerge.ts --apply    # write
 */

import { config } from 'dotenv'
config({ path: '.env.production' })

import { prisma } from '../lib/db'
import { runWithTenant } from '../lib/tenant-context'
import { rebuildSetParticipantsFromContributions } from '../lib/services/contribution-service'
import { recomputePersonCurrentStateStandalone } from '../lib/services/current-state-service'
import { refreshPersonAffiliations } from '../lib/services/view-service'

const TENANT = 'xpulse'

// Verified anchors (see incident analysis). The script asserts the live state
// matches before writing, so a second run (or drifted state) aborts safely.
const SET_ID = 'cmqktg4lm0xlc01qcusqffbbq' // EuroNudes "Set 1" (Nella)
const MAK_PERSON_ID = 'cmrkypg680hks01s0bml80v2w'
const SNAPSHOT_ID = 'cmqktg4mk0xlf01qcrmd4ylix'
const STAGING_ID = 'cmrkyp0cy0hiu01s0vy7v10hg' // "Good Morning" (Mak)
const IMPORT_ITEM_ID = 'cmrkyp05v0hgt01s08sno9l0g'
const POLLUTED_EXTERNAL_ID = '588458'

function line() {
  console.log('─'.repeat(72))
}

async function main(apply: boolean) {
  console.log(apply ? '\n*** APPLY MODE — WILL WRITE TO xpulse PROD ***\n' : '\n=== DRY RUN — no writes ===\n')

  // ── Gather current state ─────────────────────────────────────────────────
  const set = await prisma.set.findUnique({
    where: { id: SET_ID },
    select: { id: true, title: true, description: true, imageCount: true, externalId: true },
  })
  if (!set) throw new Error(`Set ${SET_ID} not found — aborting.`)

  const primary = await prisma.setSession.findFirst({
    where: { setId: SET_ID, isPrimary: true },
    select: { sessionId: true },
  })
  if (!primary) throw new Error('No primary session on the EuroNudes set — aborting.')

  const makContribution = await prisma.sessionContribution.findFirst({
    where: { sessionId: primary.sessionId, personId: MAK_PERSON_ID },
    select: { id: true },
  })
  const badCredits = await prisma.setCreditRaw.findMany({
    where: {
      setId: SET_ID,
      OR: [{ resolvedPersonId: MAK_PERSON_ID }, { rawName: { contains: 'Zemskov', mode: 'insensitive' } }],
    },
    select: { id: true, rawName: true },
  })
  const staging = await prisma.stagingSet.findUnique({
    where: { id: STAGING_ID },
    select: { id: true, status: true, promotedSetId: true, rejectedMatchSetIds: true },
  })
  const item = await prisma.importItem.findUnique({
    where: { id: IMPORT_ITEM_ID },
    select: { id: true, status: true, matchedEntityId: true, matchConfidence: true },
  })
  const snapshot = await prisma.setCoherenceSnapshot.findUnique({
    where: { id: SNAPSHOT_ID },
    select: { id: true, stagingSetId: true, setId: true },
  })

  // ── Safety assertions: refuse if state already recovered / drifted ───────
  const problems: string[] = []
  if (set.externalId !== POLLUTED_EXTERNAL_ID)
    problems.push(`Set.externalId is ${JSON.stringify(set.externalId)}, expected "${POLLUTED_EXTERNAL_ID}" (already recovered?)`)
  if (!makContribution) problems.push('Mak contribution not found on primary session (already removed?)')
  if (staging?.status !== 'PROMOTED') problems.push(`staging.status is ${staging?.status}, expected PROMOTED`)
  if (staging?.promotedSetId !== SET_ID) problems.push(`staging.promotedSetId is ${staging?.promotedSetId}, expected ${SET_ID}`)
  if (item?.matchedEntityId !== SET_ID) problems.push(`import_item.matchedEntityId is ${item?.matchedEntityId}, expected ${SET_ID}`)

  line()
  console.log('BEFORE')
  line()
  console.log('Set "Set 1" (EuroNudes/Nella):')
  console.log(`  description : ${JSON.stringify(set.description)}`)
  console.log(`  imageCount  : ${set.imageCount}`)
  console.log(`  externalId  : ${set.externalId}`)
  console.log(`  Mak contribution : ${makContribution?.id ?? '(none)'}`)
  console.log(`  bad credits      : ${badCredits.map((c) => `${c.rawName}[${c.id}]`).join(', ') || '(none)'}`)
  console.log(`  coherence snapshot ${SNAPSHOT_ID}: stagingSetId=${snapshot?.stagingSetId}, setId=${snapshot?.setId}`)
  console.log('Staging "Good Morning" (Mak):')
  console.log(`  status=${staging?.status}  promotedSetId=${staging?.promotedSetId}`)
  console.log(`  rejectedMatchSetIds=${JSON.stringify(staging?.rejectedMatchSetIds)}`)
  console.log(`ImportItem: status=${item?.status}  matchedEntityId=${item?.matchedEntityId}  matchConfidence=${item?.matchConfidence}`)

  if (problems.length > 0) {
    line()
    console.log('ABORTING — live state does not match the expected pre-recovery shape:')
    for (const p of problems) console.log(`  ✗ ${p}`)
    process.exit(1)
  }

  line()
  console.log('PLANNED CHANGES')
  line()
  console.log(`  1. delete SessionContribution ${makContribution!.id} (Mak)`)
  console.log(`  2. delete SetCreditRaw: ${badCredits.map((c) => c.rawName).join(', ')}`)
  console.log('  3. Set.description → null, imageCount → null, externalId → null')
  console.log('  4. rebuild SetParticipant cache (drops Mak, keeps Nella)')
  console.log(`  5. coherence snapshot ${SNAPSHOT_ID}: stagingSetId → null (keep setId)`)
  console.log('  6. staging: status → APPROVED, promotedSetId → null, +reject EuroNudes match')
  console.log('  7. import_item: status → NEW, matchedEntityId/Confidence/Details → null')
  console.log('  8. (post-commit) recompute Mak current-state + refresh affiliations MV')

  if (!apply) {
    line()
    console.log('DRY RUN complete — nothing written. Re-run with --apply to execute.')
    process.exit(0)
  }

  // ── Apply (single transaction) ───────────────────────────────────────────
  await prisma.$transaction(async (tx) => {
    await tx.sessionContribution.delete({ where: { id: makContribution!.id } })
    await tx.setCreditRaw.deleteMany({ where: { id: { in: badCredits.map((c) => c.id) } } })
    await tx.set.update({
      where: { id: SET_ID },
      data: { description: null, imageCount: null, externalId: null },
    })
    await rebuildSetParticipantsFromContributions(tx, SET_ID)
    await tx.setCoherenceSnapshot.update({ where: { id: SNAPSHOT_ID }, data: { stagingSetId: null } })
    const rejected = new Set(staging!.rejectedMatchSetIds)
    rejected.add(SET_ID)
    await tx.stagingSet.update({
      where: { id: STAGING_ID },
      data: { status: 'APPROVED', promotedSetId: null, rejectedMatchSetIds: [...rejected] },
    })
    await tx.importItem.update({
      where: { id: IMPORT_ITEM_ID },
      data: { status: 'NEW', matchedEntityId: null, matchConfidence: null, matchDetails: null },
    })
  })

  // Post-commit standalone recomputes (own connections/txns).
  await recomputePersonCurrentStateStandalone(MAK_PERSON_ID)
  await refreshPersonAffiliations()

  // ── Verify AFTER ─────────────────────────────────────────────────────────
  const after = await prisma.set.findUnique({
    where: { id: SET_ID },
    select: { description: true, imageCount: true, externalId: true },
  })
  const parts = await prisma.setParticipant.findMany({ where: { setId: SET_ID }, select: { personId: true } })
  const stagingAfter = await prisma.stagingSet.findUnique({
    where: { id: STAGING_ID },
    select: { status: true, promotedSetId: true },
  })
  line()
  console.log('AFTER')
  line()
  console.log(`Set: description=${JSON.stringify(after?.description)} imageCount=${after?.imageCount} externalId=${after?.externalId}`)
  console.log(`Set participants: ${parts.map((p) => p.personId).join(', ')} (expect Nella only)`)
  console.log(`Staging: status=${stagingAfter?.status} promotedSetId=${stagingAfter?.promotedSetId}`)
  console.log('\n✓ Recovery applied.')
  process.exit(0)
}

const apply = process.argv.includes('--apply')
runWithTenant(TENANT, () => main(apply)).catch((err) => {
  console.error(err)
  process.exit(1)
})
