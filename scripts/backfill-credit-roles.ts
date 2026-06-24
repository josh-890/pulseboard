/**
 * ADR-0021 Phase 1 backfill.
 *
 * Role-less SetCreditRaw rows are imported "artist" credits (behind-camera). Give them
 * the `photographer` role so contributor kind is role-driven and they surface in the
 * session view. Targets role-less credits that are resolved-as-Artist or unresolved —
 * NOT resolved-to-Person (none exist; left for manual review if any appear) and NOT
 * ignored. Idempotent. Dry-run by default; --apply to write. Run per tenant.
 */

import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const apply = process.argv.includes('--apply')
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

async function main() {
  const photographer = await prisma.contributionRoleDefinition.findFirst({
    where: { slug: 'photographer' },
    select: { id: true, name: true },
  })
  if (!photographer) {
    console.error('No `photographer` role definition found — aborting.')
    process.exitCode = 1
    return
  }

  const where = {
    roleDefinitionId: null,
    resolvedPersonId: null,
    resolutionStatus: { not: 'IGNORED' as const },
  }
  const count = await prisma.setCreditRaw.count({ where })
  console.log(`Role-less behind-camera credits to assign "${photographer.name}": ${count}`)

  if (apply && count > 0) {
    const res = await prisma.setCreditRaw.updateMany({ where, data: { roleDefinitionId: photographer.id } })
    console.log(`Applied: set photographer role on ${res.count} credit(s).`)
  } else if (!apply) {
    console.log('(dry-run — re-run with --apply to write)')
  }
}

main().finally(() => prisma.$disconnect())
