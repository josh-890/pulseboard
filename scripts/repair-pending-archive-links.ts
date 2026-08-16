/**
 * Tell confirmed links what the scan already knew about their folder.
 *
 * The two develop paths (`createStagingSetFromOrphan`, `linkFolderToStagingSet`)
 * wrote `archiveStatus: PENDING` — "a path was noted, nobody has looked at it" —
 * even though the folder they linked to had been scanned and counted. The set
 * page then shows a blue badge beside the word Archive, which reads as an
 * unconfirmed link, and offers no way to act on it: the link is confirmed
 * already. A targeted scan eventually corrects it, which is why this stayed
 * invisible for so long.
 *
 * Both call sites now inherit the folder's facts (`archiveFieldsFromFolder`).
 * This repairs the rows written before that. Dry-run by default; idempotent.
 *
 *     npx tsx scripts/repair-pending-archive-links.ts                  # dev, dry run
 *     npx tsx scripts/repair-pending-archive-links.ts --prod --apply   # write
 */

import dotenv from 'dotenv'

const prod = process.argv.includes('--prod')
const apply = process.argv.includes('--apply')
dotenv.config({ path: prod ? '.env.production' : '.env' })

let prisma: (typeof import('../src/lib/db'))['prisma']
let runWithTenant: (typeof import('../src/lib/tenant-context'))['runWithTenant']
let archiveFieldsFromFolder: (typeof import('../src/lib/services/archive-service'))['archiveFieldsFromFolder']

async function loadModules() {
  ;({ prisma } = await import('../src/lib/db'))
  ;({ runWithTenant } = await import('../src/lib/tenant-context'))
  ;({ archiveFieldsFromFolder } = await import('../src/lib/services/archive-service'))
}

async function repair(tenant: string) {
  const links = await prisma.archiveLink.findMany({
    where: { status: 'CONFIRMED', archiveStatus: 'PENDING', archiveFolderId: { not: undefined } },
    select: {
      id: true,
      archiveFolder: {
        select: {
          folderName: true, relativePath: true, fullPath: true,
          fileCount: true, videoPresent: true, missingOnDisk: true,
        },
      },
    },
  })

  console.log(`\n=== ${tenant} — ${links.length} confirmed link(s) still reported as not scanned ===`)

  let repaired = 0
  for (const link of links) {
    const folder = link.archiveFolder
    if (!folder) continue
    const fields = archiveFieldsFromFolder(folder)
    console.log(`  ${apply ? 'set' : 'would set'} ${fields.archiveStatus}, ${fields.archiveFileCount ?? '?'} files — "${folder.folderName}"`)
    if (!apply) continue
    await prisma.archiveLink.update({ where: { id: link.id }, data: fields })
    repaired++
  }

  if (!apply && links.length > 0) console.log('  (dry run — pass --apply to write)')
  else if (apply) console.log(`  repaired ${repaired}`)
}

async function main() {
  await loadModules()
  if (!prod) return repair('dev')
  const tenants = (process.env.TENANT_REGISTRY ?? 'pulse')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  for (const tenant of tenants) await runWithTenant(tenant, () => repair(tenant))
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .then(() => process.exit(0))
