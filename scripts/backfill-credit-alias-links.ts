/**
 * Backfill resolvedAliasId and creditNameOverride for existing records.
 *
 * Three passes:
 *
 * 1. SetCreditRaw.resolvedAliasId — for RESOLVED credits where rawName
 *    normalizes to a PersonAlias.nameNorm for the resolved person.
 *
 * 2. SessionContribution.creditNameOverride — for CREDIT_MATCH contributions
 *    with no override, find the linked SetCreditRaw and copy rawName across.
 *
 * 3. SessionContribution.resolvedAliasId — for contributions with a
 *    creditNameOverride, find the matching PersonAlias and link it.
 *
 * Safe to run multiple times — only touches rows where the target field is null.
 *
 * Usage:
 *   npx tsx scripts/backfill-credit-alias-links.ts           # dev DB
 *   DATABASE_URL=<prod-url> npx tsx scripts/backfill-credit-alias-links.ts
 */

import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL!
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

function normalizeForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

async function main() {
  console.log(`DB: ${connectionString.replace(/:[^:@]+@/, ':***@')}`)
  console.log('')

  // ── Pass 1: SetCreditRaw.resolvedAliasId ─────────────────────────────────

  console.log('Pass 1: SetCreditRaw.resolvedAliasId')

  const resolvedCredits = await prisma.setCreditRaw.findMany({
    where: {
      resolutionStatus: 'RESOLVED',
      resolvedPersonId: { not: undefined },
      resolvedAliasId: null,
    },
    select: { id: true, rawName: true, resolvedPersonId: true },
  })

  console.log(`  ${resolvedCredits.length} RESOLVED credits with no resolvedAliasId`)

  let pass1Updated = 0
  let pass1NoMatch = 0

  for (const credit of resolvedCredits) {
    if (!credit.rawName || !credit.resolvedPersonId) continue
    const nameNorm = normalizeForSearch(credit.rawName)
    const alias = await prisma.personAlias.findFirst({
      where: { personId: credit.resolvedPersonId, nameNorm },
      select: { id: true },
    })
    if (alias) {
      await prisma.setCreditRaw.update({
        where: { id: credit.id },
        data: { resolvedAliasId: alias.id },
      })
      pass1Updated++
    } else {
      pass1NoMatch++
    }
  }

  console.log(`  → linked: ${pass1Updated}, no matching alias: ${pass1NoMatch}`)
  console.log('')

  // ── Pass 2: SessionContribution.creditNameOverride ───────────────────────

  console.log('Pass 2: SessionContribution.creditNameOverride (from SetCreditRaw)')

  const creditMatchContributions = await prisma.sessionContribution.findMany({
    where: {
      confidenceSource: 'CREDIT_MATCH',
      creditNameOverride: null,
    },
    select: {
      id: true,
      personId: true,
      roleDefinitionId: true,
      session: {
        select: {
          setSessionLinks: {
            select: { setId: true },
          },
        },
      },
    },
  })

  console.log(`  ${creditMatchContributions.length} CREDIT_MATCH contributions with no creditNameOverride`)

  let pass2Updated = 0
  let pass2NoMatch = 0

  for (const contribution of creditMatchContributions) {
    const setIds = contribution.session.setSessionLinks.map((l) => l.setId)
    if (setIds.length === 0) { pass2NoMatch++; continue }

    // Find a RESOLVED SetCreditRaw in any linked set for this person+role
    const credit = await prisma.setCreditRaw.findFirst({
      where: {
        setId: { in: setIds },
        resolutionStatus: 'RESOLVED',
        resolvedPersonId: contribution.personId,
        roleDefinitionId: contribution.roleDefinitionId,
      },
      select: { rawName: true },
    })

    if (credit?.rawName) {
      await prisma.sessionContribution.update({
        where: { id: contribution.id },
        data: { creditNameOverride: credit.rawName },
      })
      pass2Updated++
    } else {
      pass2NoMatch++
    }
  }

  console.log(`  → backfilled: ${pass2Updated}, no matching credit found: ${pass2NoMatch}`)
  console.log('')

  // ── Pass 3: SessionContribution.resolvedAliasId ──────────────────────────

  console.log('Pass 3: SessionContribution.resolvedAliasId')

  // Re-fetch all contributions that now have a creditNameOverride but no resolvedAliasId
  const contributionsForAliasLink = await prisma.sessionContribution.findMany({
    where: {
      resolvedAliasId: null,
      creditNameOverride: { not: null },
    },
    select: { id: true, personId: true, creditNameOverride: true },
  })

  console.log(`  ${contributionsForAliasLink.length} contributions with creditNameOverride but no resolvedAliasId`)

  let pass3Updated = 0
  let pass3NoMatch = 0

  for (const contribution of contributionsForAliasLink) {
    if (!contribution.creditNameOverride) continue
    const nameNorm = normalizeForSearch(contribution.creditNameOverride)
    const alias = await prisma.personAlias.findFirst({
      where: { personId: contribution.personId, nameNorm },
      select: { id: true },
    })
    if (alias) {
      await prisma.sessionContribution.update({
        where: { id: contribution.id },
        data: { resolvedAliasId: alias.id },
      })
      pass3Updated++
    } else {
      pass3NoMatch++
    }
  }

  console.log(`  → linked: ${pass3Updated}, no matching alias: ${pass3NoMatch}`)
  console.log('')

  console.log('Done.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
