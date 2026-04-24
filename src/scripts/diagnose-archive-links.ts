/**
 * Diagnostic script: query archive link state for sets where the browser
 * shows "no archive folder linked" but we expect them to be linked.
 *
 * Usage (dev):
 *   npx tsx src/scripts/diagnose-archive-links.ts
 *
 * Usage (prod):
 *   DATABASE_URL="..." npx tsx src/scripts/diagnose-archive-links.ts
 */

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL ?? ''
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter } as never)

async function main() {
  const url = process.env.DATABASE_URL ?? '(default)'
  console.log(`\nDB: ${url.replace(/:\/\/[^@]+@/, '://***@')}\n`)

  // 1. Find sets with a linked archive folder (via ArchiveFolder.linkedSetId)
  //    but missing coherence snapshot archiveFolderId
  const setsWithFolder = await prisma.set.findMany({
    where: {
      archiveFolder: { isNot: null },
    },
    select: {
      id: true,
      title: true,
      archiveStatus: true,
      archivePath: true,
      archiveFolder: { select: { id: true, folderName: true, relativePath: true } },
      coherenceSnapshot: {
        select: {
          id: true,
          setId: true,
          stagingSetId: true,
          archiveFolderId: true,
          archiveStatus: true,
          archiveFolder: { select: { id: true, folderName: true } },
        },
      },
    },
    orderBy: { title: 'asc' },
  })

  console.log(`=== Sets with ArchiveFolder.linkedSetId (${setsWithFolder.length} total) ===`)
  let brokenCount = 0
  for (const s of setsWithFolder) {
    const snapHasFolder = !!s.coherenceSnapshot?.archiveFolderId
    const snapMatchesFolder = s.coherenceSnapshot?.archiveFolderId === s.archiveFolder?.id
    if (!snapHasFolder || !snapMatchesFolder) {
      brokenCount++
      console.log(`\n[BROKEN] ${s.title} (${s.id})`)
      console.log(`  Set.archiveStatus: ${s.archiveStatus}`)
      console.log(`  Set.archivePath: ${s.archivePath}`)
      console.log(`  ArchiveFolder: ${s.archiveFolder?.folderName} (${s.archiveFolder?.id})`)
      console.log(`  Snapshot: ${JSON.stringify(s.coherenceSnapshot)}`)
    }
  }
  if (brokenCount === 0) {
    console.log('  All OK — every set with a linked folder has a matching snapshot.')
  }

  // 2. Look up "Minnow" specifically
  const minnow = await prisma.set.findFirst({
    where: { title: { contains: 'Minnow', mode: 'insensitive' } },
    select: {
      id: true,
      title: true,
      archiveStatus: true,
      archivePath: true,
      archiveFolder: { select: { id: true, folderName: true, relativePath: true, linkedSetId: true } },
      coherenceSnapshot: {
        select: {
          id: true,
          setId: true,
          stagingSetId: true,
          archiveFolderId: true,
          archiveStatus: true,
        },
      },
    },
  })

  console.log(`\n=== Minnow lookup ===`)
  console.log(JSON.stringify(minnow, null, 2))

  // 3. Archive folders that have a linkedSetId but the set's coherence snapshot
  //    doesn't reference them
  const allFoldersWithLink = await prisma.archiveFolder.findMany({
    where: { linkedSetId: { not: null } },
    select: {
      id: true,
      folderName: true,
      relativePath: true,
      linkedSetId: true,
      linkedSet: {
        select: {
          id: true,
          title: true,
          coherenceSnapshot: { select: { id: true, archiveFolderId: true } },
        },
      },
    },
  })

  const foldersWithBrokenSnap = allFoldersWithLink.filter(
    (f) => !f.linkedSet?.coherenceSnapshot?.archiveFolderId ||
           f.linkedSet.coherenceSnapshot.archiveFolderId !== f.id
  )

  console.log(`\n=== Folders with linkedSetId but broken/missing snapshot (${foldersWithBrokenSnap.length}) ===`)
  for (const f of foldersWithBrokenSnap) {
    console.log(`\n  Folder: ${f.folderName} (${f.id})`)
    console.log(`  linkedSetId: ${f.linkedSetId}`)
    console.log(`  Set title: ${f.linkedSet?.title}`)
    console.log(`  Snapshot archiveFolderId: ${f.linkedSet?.coherenceSnapshot?.archiveFolderId ?? 'null'}`)
  }
  if (foldersWithBrokenSnap.length === 0) {
    console.log('  All OK.')
  }

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
