/**
 * Give the dates that came from an archive folder their precision back.
 *
 * `createStagingSetFromOrphan` wrote `releaseDate` from the folder name —
 * `2014-02-12-KC Katya - Ibiza Mix Part 4`, a full day — but left
 * `releaseDatePrecision` at the schema default `UNKNOWN`. Promotion copies that
 * to the Set and to the Session, and `computeProductionAge` treats a date of
 * unknown precision as unusable: **no participant age is shown anywhere**,
 * although the date and the birthdate are both on file.
 *
 * The source is fixed. This repairs the rows written before that — only where the
 * date demonstrably came from a folder (a confirmed archive link whose folder
 * parsed the same day), because an `UNKNOWN` precision elsewhere may be somebody
 * saying "I do not know when this was".
 *
 * Dry-run by default; idempotent.
 *
 *     npx tsx scripts/repair-folder-date-precision.ts                  # dev, dry run
 *     npx tsx scripts/repair-folder-date-precision.ts --prod --apply   # write
 */

import dotenv from 'dotenv'

const prod = process.argv.includes('--prod')
const apply = process.argv.includes('--apply')
dotenv.config({ path: prod ? '.env.production' : '.env' })

let prisma: (typeof import('../src/lib/db'))['prisma']
let runWithTenant: (typeof import('../src/lib/tenant-context'))['runWithTenant']

async function loadModules() {
  ;({ prisma } = await import('../src/lib/db'))
  ;({ runWithTenant } = await import('../src/lib/tenant-context'))
}

const sameDay = (a: Date | null, b: Date | null) =>
  !!a && !!b && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)

async function repair(tenant: string) {
  console.log(`\n=== ${tenant} ===`)

  // ── Staged sets ────────────────────────────────────────────────────────────
  const staged = await prisma.stagingSet.findMany({
    where: { releaseDate: { not: null }, releaseDatePrecision: 'UNKNOWN' },
    select: {
      id: true,
      title: true,
      releaseDate: true,
      promotedSetId: true,
      // Both sides: promotion moves the archive link from the staging row to the
      // Set, so a promoted row's own `archiveLinks` is empty — and those are
      // exactly the rows whose missing precision is visible on a set page.
      archiveLinks: {
        where: { status: 'CONFIRMED' },
        select: { archiveFolder: { select: { parsedDate: true, folderName: true } } },
      },
      promotedSet: {
        select: {
          archiveLinks: {
            where: { status: 'CONFIRMED' },
            select: { archiveFolder: { select: { parsedDate: true, folderName: true } } },
          },
        },
      },
    },
  })

  const fromFolder = staged.filter((s) =>
    [...s.archiveLinks, ...(s.promotedSet?.archiveLinks ?? [])].some((l) =>
      sameDay(l.archiveFolder?.parsedDate ?? null, s.releaseDate),
    ),
  )
  const other = staged.length - fromFolder.length
  console.log(`  staged sets with a date but no precision: ${staged.length}`)
  console.log(`     of those, the date is the folder's own: ${fromFolder.length}`)
  if (other > 0) console.log(`     left alone (no folder says that day): ${other}`)

  for (const s of fromFolder) console.log(`  ${apply ? 'set DAY' : 'would set DAY'}  "${s.title}"`)

  if (apply && fromFolder.length > 0) {
    await prisma.stagingSet.updateMany({
      where: { id: { in: fromFolder.map((s) => s.id) } },
      data: { releaseDatePrecision: 'DAY' },
    })
  }

  // ── The Sets they were promoted into, and those Sets' sessions ─────────────
  const promotedIds = fromFolder.map((s) => s.promotedSetId).filter((id): id is string => !!id)
  const sets = promotedIds.length
    ? await prisma.set.findMany({
        where: { id: { in: promotedIds }, releaseDate: { not: null }, releaseDatePrecision: 'UNKNOWN' },
        select: {
          id: true,
          title: true,
          releaseDate: true,
          sessionLinks: { select: { session: { select: { id: true, date: true, datePrecision: true } } } },
        },
      })
    : []

  console.log(`  promoted sets to repair: ${sets.length}`)
  for (const s of sets) console.log(`  ${apply ? 'set DAY' : 'would set DAY'}  Set "${s.title}"`)

  // A session dated the same day as its set inherited the same missing precision.
  const sessionIds = sets.flatMap((s) =>
    s.sessionLinks
      .filter((l) => l.session.datePrecision === 'UNKNOWN' && sameDay(l.session.date, s.releaseDate))
      .map((l) => l.session.id),
  )
  console.log(`  sessions to repair: ${sessionIds.length}`)

  if (apply) {
    if (sets.length > 0) {
      await prisma.set.updateMany({
        where: { id: { in: sets.map((s) => s.id) } },
        data: { releaseDatePrecision: 'DAY' },
      })
    }
    if (sessionIds.length > 0) {
      await prisma.session.updateMany({
        where: { id: { in: sessionIds } },
        data: { datePrecision: 'DAY' },
      })
    }
    console.log(`  repaired ${fromFolder.length} staged, ${sets.length} set(s), ${sessionIds.length} session(s)`)
  } else {
    console.log('  (dry run — pass --apply to write)')
  }
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
