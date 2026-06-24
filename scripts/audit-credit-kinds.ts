/**
 * ADR-0021 Phase 1 audit (read-only).
 *
 * Reports the SetCreditRaw rows that the role-driven contributor-kind model needs to
 * reconcile before Phase 2/4:
 *   A. role-less credits (no roleDefinitionId), split by resolution;
 *   B. Behind-Camera credits resolved to a PERSON (old dual-path leak);
 *   C. On-Camera credits resolved to an ARTIST (shouldn't exist).
 *
 * Run per tenant: DATABASE_URL=... npx tsx scripts/audit-credit-kinds.ts
 */

import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { BEHIND_CAMERA_GROUP } from '../src/lib/services/session-contributors'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

async function main() {
  const credits = await prisma.setCreditRaw.findMany({
    select: {
      id: true,
      rawName: true,
      resolutionStatus: true,
      resolvedPersonId: true,
      resolvedArtistId: true,
      roleDefinition: { select: { name: true, group: { select: { name: true } } } },
    },
  })

  // A. role-less
  const roleLess = credits.filter((c) => !c.roleDefinition)
  const roleLessResolvedArtist = roleLess.filter((c) => c.resolvedArtistId)
  const roleLessResolvedPerson = roleLess.filter((c) => c.resolvedPersonId)
  const roleLessUnresolved = roleLess.filter(
    (c) => !c.resolvedArtistId && !c.resolvedPersonId && c.resolutionStatus !== 'IGNORED',
  )
  const roleLessIgnored = roleLess.filter((c) => c.resolutionStatus === 'IGNORED')

  // B. Behind-Camera resolved to a Person
  const bcToPerson = credits.filter(
    (c) => c.roleDefinition?.group.name === BEHIND_CAMERA_GROUP && c.resolvedPersonId,
  )
  // C. On-Camera resolved to an Artist
  const ocToArtist = credits.filter(
    (c) => c.roleDefinition && c.roleDefinition.group.name !== BEHIND_CAMERA_GROUP && c.resolvedArtistId,
  )

  console.log(`Total credits: ${credits.length}`)
  console.log(`A. role-less: ${roleLess.length}  (resolved-artist ${roleLessResolvedArtist.length} · ` +
    `resolved-person ${roleLessResolvedPerson.length} · unresolved ${roleLessUnresolved.length} · ignored ${roleLessIgnored.length})`)
  console.log(`   → backfillable to photographer (resolved-artist + unresolved): ${roleLessResolvedArtist.length + roleLessUnresolved.length}`)
  console.log(`   → role-less resolved-PERSON (manual review): ${roleLessResolvedPerson.length}`)
  console.log(`B. Behind-Camera resolved to a Person (dual-path leak): ${bcToPerson.length}`)
  for (const c of bcToPerson.slice(0, 15)) console.log(`     leak  "${c.rawName}"  (${c.roleDefinition?.name})`)
  console.log(`C. On-Camera resolved to an Artist (anomaly): ${ocToArtist.length}`)
  for (const c of ocToArtist.slice(0, 15)) console.log(`     anomaly  "${c.rawName}"  (${c.roleDefinition?.name})`)
}

main().finally(() => prisma.$disconnect())
