/**
 * How often does a folder's confirmed attribution contradict the set it is
 * linked to?
 *
 * Two truths about who is in a set are written independently and neither side
 * reads the other: your workbench attribution (ArchiveFolderAttribution) and the
 * person import (StagingSet.participants / SetParticipant). `confirmArchiveLink`
 * writes the link without looking at the attributions, so the contradiction is
 * recorded silently — and `linkFolderToStagingSet` resolves the same
 * contradiction the *other* way, by unioning. Which claim survives therefore
 * depends on which side was touched last.
 *
 * Read-only. Measures before anything is changed, on every tenant:
 *
 *     npx tsx scripts/detect-attribution-conflicts.ts            # dev (.env)
 *     npx tsx scripts/detect-attribution-conflicts.ts --prod     # pulse + xpulse
 *
 * Exit code is always 0: rows here are a finding to look at, not a build break.
 */

import dotenv from 'dotenv'
import { prisma } from '../src/lib/db'
import { getAttributionLinkAudit } from '../src/lib/services/maintenance-service'
import { runWithTenant } from '../src/lib/tenant-context'

const prod = process.argv.includes('--prod')
dotenv.config({ path: prod ? '.env.production' : '.env' })

async function report(tenant: string) {
  const { checked, comparable, conflicts: rows } = await getAttributionLinkAudit()
  // Without the population, 0 cannot be read: "nothing disagrees" and "nothing
  // was in a position to disagree" look identical. Both sides are printed, so a
  // zero overlap is visible as a zero overlap rather than as health.
  const [attributions, confirmedLinks] = await Promise.all([
    prisma.archiveFolderAttribution.count(),
    prisma.archiveLink.count({ where: { status: 'CONFIRMED' } }),
  ])
  console.log(`\n=== ${tenant} — ${rows.length} contradiction${rows.length === 1 ? '' : 's'} ===`)
  console.log(`  ${attributions} attribution(s) · ${confirmedLinks} confirmed link(s)`)
  console.log(`  ${checked} attribution(s) sit on a confirmed link · ${comparable} against a set that names somebody`)
  if (rows.length === 0) {
    console.log('  none: every comparable link agrees with the folder attributions')
    return
  }

  // Grouped by person, because one wrong attribution repeated across a whole
  // alias group is a different problem from 40 unrelated one-offs — and the fix
  // for the first is one decision, not 40.
  const byPerson = new Map<string, { name: string; folders: string[] }>()
  for (const r of rows) {
    const entry = byPerson.get(r.attributedIcgId) ?? { name: r.attributedName, folders: [] }
    entry.folders.push(`${r.folderName}  →  ${r.targetTitle} [${r.kind}] lists: ${r.targetParticipants ?? '—'}`)
    byPerson.set(r.attributedIcgId, entry)
  }

  for (const [icgId, entry] of [...byPerson].sort((a, b) => b[1].folders.length - a[1].folders.length)) {
    console.log(`\n  ${entry.name} (${icgId}) — ${entry.folders.length} folder(s)`)
    for (const f of entry.folders.slice(0, 10)) console.log(`    ${f}`)
    if (entry.folders.length > 10) console.log(`    … and ${entry.folders.length - 10} more`)
  }
}

async function main() {
  if (!prod) {
    await report('dev')
    return
  }
  const tenants = (process.env.TENANT_REGISTRY ?? 'pulse').split(',').map((t) => t.trim()).filter(Boolean)
  for (const tenant of tenants) {
    await runWithTenant(tenant, () => report(tenant))
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .then(() => process.exit(0))
