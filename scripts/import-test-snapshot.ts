/**
 * One person, everything the archive/import join knows about her, on one screen.
 *
 * Importing somebody you have already marked in the archive runs through four
 * records that live on four different pages: the Person, her staged sets, the
 * folders carrying your markers, and the links between them. When the result
 * looks wrong, the question is always *which* of the four disagrees — and the UI
 * cannot show them side by side.
 *
 * Read-only. Run it before the import for a baseline, and after each step.
 *
 *     npx tsx scripts/import-test-snapshot.ts CA-924J            # xpulse (default)
 *     npx tsx scripts/import-test-snapshot.ts IC-87VY pulse
 *     npx tsx scripts/import-test-snapshot.ts CA-924J --dev
 *
 * What it flags, because these are the failures that actually happened:
 *
 *   ⚠ a link below HIGH confidence — the matcher's "look at this yourself". A
 *     same-day, same-channel folder for a *different* person scores MEDIUM
 *     (seen: staged "Lormada" against folder "MA Nalina - Minarie").
 *   ⚠ a folder whose markers name somebody else as well — two people proposed
 *     for one folder is a decision, never a merge (ADR-0028).
 *   ⚠ a ghost Contact still standing next to an existing Person: the import is
 *     supposed to retire it (reconcileContacts).
 */

import dotenv from 'dotenv'

const args = process.argv.slice(2)
const dev = args.includes('--dev')
const positional = args.filter((a) => !a.startsWith('--'))
const ICG = positional[0]
const TENANT = positional[1] ?? (dev ? 'default' : 'xpulse')

if (!ICG) {
  console.error('usage: npx tsx scripts/import-test-snapshot.ts <ICG-ID> [tenant] [--dev]')
  process.exit(1)
}

dotenv.config({ path: dev ? '.env' : '.env.production' })

const coverOrigin = (url: string | null): string =>
  !url ? 'none'
    : url.includes('/archive/') ? 'archive thumbnail'
      : url.includes('/staging/') ? 'publisher'
        : 'external (never rendered)'

async function main() {
  const { prisma } = await import('../src/lib/db')
  const { runWithTenant } = await import('../src/lib/tenant-context')

  await runWithTenant(TENANT, async () => {
    console.log(`\n════ ${ICG} on ${TENANT} — ${new Date().toISOString()} ════`)

    const [person, contact] = await Promise.all([
      prisma.person.findFirst({
        where: { icgId: ICG },
        select: { id: true, createdAt: true, aliases: { select: { name: true, isCommon: true } } },
      }),
      prisma.contact.findFirst({ where: { icgId: ICG }, select: { name: true, ignoredAt: true } }),
    ])
    console.log(
      `Person : ${person
        ? `${person.aliases.map((a) => a.name).join(', ')} (created ${person.createdAt.toISOString().slice(0, 16)})`
        : '— none —'}`,
    )
    console.log(`Contact: ${contact ? `${contact.name}${contact.ignoredAt ? ' (ignored)' : ''}` : '— none —'}`)
    if (person && contact && !contact.ignoredAt) {
      console.log('   ⚠ a ghost Contact beside an existing Person — the import should have retired it')
    }

    // ── Staged sets ───────────────────────────────────────────────────────────
    const staged = await prisma.stagingSet.findMany({
      where: { participantIcgIds: { has: ICG } },
      select: {
        title: true, channelName: true, releaseDate: true, status: true,
        coverImageUrl: true, promotedSetId: true,
        archiveLinks: {
          select: { status: true, confidence: true, archiveFolder: { select: { folderName: true } } },
        },
      },
      orderBy: { releaseDate: 'asc' },
    })
    const linkedStaged = staged.filter((s) => s.archiveLinks.length > 0)
    console.log(`\nStaged sets naming her: ${staged.length}  (${linkedStaged.length} with an archive link)`)
    for (const s of linkedStaged) {
      const l = s.archiveLinks[0]
      const conf = l.confidence ?? (l.status === 'CONFIRMED' ? 'confirmed' : '?')
      const warn = l.status !== 'CONFIRMED' && l.confidence !== 'HIGH' ? '  ⚠ below HIGH — check it' : ''
      console.log(`  [${s.status}] ${s.channelName} ${s.releaseDate?.toISOString().slice(0, 10) ?? '????-??-??'} "${s.title}"`)
      console.log(`      ${l.status}/${conf} → ${l.archiveFolder?.folderName ?? '?'}${warn}`)
      console.log(`      cover: ${coverOrigin(s.coverImageUrl)}`)
    }
    const unlinked = staged.length - linkedStaged.length
    if (unlinked > 0) console.log(`  … and ${unlinked} with no archive folder`)

    // ── Production sets ───────────────────────────────────────────────────────
    const sets = await prisma.set.findMany({
      where: { participants: { some: { person: { icgId: ICG } } } },
      select: {
        title: true, coverMediaItemId: true, coverIsProvisional: true,
        archiveLinks: { select: { status: true, archiveStatus: true, archiveFileCount: true } },
        _count: { select: { setMediaItems: true } },
      },
      orderBy: { releaseDate: 'asc' },
    })
    console.log(`\nProduction sets with her: ${sets.length}`)
    for (const s of sets) {
      const cover = !s.coverMediaItemId ? 'none' : s.coverIsProvisional ? 'stand-in (an upload may take it over)' : 'settled'
      const archive = s.archiveLinks.map((l) => `${l.status}/${l.archiveStatus}/${l.archiveFileCount ?? '?'} files`).join(' | ') || 'none'
      console.log(`  "${s.title}"  images=${s._count.setMediaItems}  cover=${cover}  archive=${archive}`)
    }

    // ── Folders proposing her ────────────────────────────────────────────────
    const suggestions = await prisma.archiveFolderSuggestion.findMany({
      where: { icgId: ICG },
      select: {
        source: true, tier: true,
        archiveFolder: {
          select: {
            folderName: true, fileCount: true, coverKey: true,
            archiveLink: { select: { status: true, confidence: true, stagingSetId: true, setId: true } },
            attributions: { select: { icgId: true, name: true } },
            review: { select: { identity: true, develop: true } },
            suggestions: { select: { icgId: true, name: true, source: true } },
          },
        },
      },
    })

    // One folder can carry a marker *and* a catalogue row; the folder is the unit.
    const byFolder = new Map<string, { sources: string[]; folder: (typeof suggestions)[number]['archiveFolder'] }>()
    for (const s of suggestions) {
      const key = s.archiveFolder.folderName
      const entry = byFolder.get(key) ?? { sources: [], folder: s.archiveFolder }
      entry.sources.push(`${s.source}/${s.tier}`)
      byFolder.set(key, entry)
    }

    const handMarked = [...byFolder.values()].filter((e) => e.sources.some((s) => s.startsWith('FOLDER_ATTRIBUTION')))
    console.log(`\nFolders proposing her: ${byFolder.size}  (${handMarked.length} carry a marker you wrote)`)
    for (const [name, { sources, folder }] of byFolder) {
      const link = folder.archiveLink
      const target = link?.setId ? 'Set' : link?.stagingSetId ? 'StagingSet' : '?'
      console.log(`  ${name}`)
      console.log(
        `      ${folder.fileCount} files · cover ${folder.coverKey ? 'yes' : 'MISSING'} · ${sources.join(' + ')}` +
        ` · link ${link ? `${link.status}${link.confidence ? '/' + link.confidence : ''} → ${target}` : 'none'}` +
        ` · claims ${folder.attributions.length || 'none'}` +
        ` · review ${folder.review?.identity ?? '-'}/${folder.review?.develop ?? '-'}`,
      )
      const others = folder.suggestions.filter((x) => x.icgId !== ICG)
      if (others.length) {
        console.log(`      ⚠ also proposed here: ${others.map((o) => `${o.name} (${o.icgId}, ${o.source})`).join(' | ')}`)
      }
    }

    // A settled folder leaves the attribution queue (archive-unsettled.ts), so a
    // marker on one is not "unanswered" — the linked set's cast answers it.
    const settled = [...byFolder.values()].filter((e) => e.folder.archiveLink?.status === 'CONFIRMED').length
    console.log(
      `\n${settled} of ${byFolder.size} folder(s) are settled by a confirmed link — those no longer appear in the attribution queue.`,
    )
  })
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .then(() => process.exit(0))
