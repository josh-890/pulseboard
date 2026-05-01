/**
 * Backfill: split staging sets that have isVideo=true AND imageCount > 0
 *
 * These sets represent a publisher entry (e.g. WATCH4BEAUTY) that ships
 * both a photo gallery and a video in a single import record. The import
 * pipeline now creates two staging sets automatically, but existing entries
 * need to be retrofitted:
 *
 *  1. Create a PHOTO sibling (isVideo=false, imageCount=N) for each conflict.
 *  2. Update the original to be the VIDEO set (imageCount=null).
 *  3. Link them via the video set's siblingId → photo set id.
 *  4. Reassign any SUGGESTED archive links that point to a photo folder
 *     from the original (video) staging set to the new photo sibling.
 *
 * Safe to run multiple times — idempotent (skips sets that already have siblingId set).
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/backfill-split-staging-sets.ts
 */

import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL!
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  const conflicts = await prisma.stagingSet.findMany({
    where: {
      isVideo: true,
      imageCount: { gt: 0 },
      siblingId: null,
    },
    include: {
      archiveLinks: {
        include: { archiveFolder: { select: { id: true, isVideo: true } } },
      },
    },
  })

  console.log(`Found ${conflicts.length} staging set(s) to split`)
  if (conflicts.length === 0) return

  for (const original of conflicts) {
    console.log(`\nProcessing: "${original.title}" (id=${original.id}, imageCount=${original.imageCount})`)

    // 1. Create photo sibling
    const photoSibling = await prisma.stagingSet.create({
      data: {
        title: original.title,
        titleNorm: original.titleNorm,
        externalId: original.externalId,
        channelName: original.channelName,
        channelId: original.channelId,
        releaseDate: original.releaseDate,
        releaseDatePrecision: original.releaseDatePrecision,
        releaseDateSuggestion: original.releaseDateSuggestion,
        isVideo: false,
        imageCount: original.imageCount,
        artist: original.artist,
        artistNorm: original.artistNorm,
        coverImageUrl: original.coverImageUrl,
        description: original.description,
        participants: original.participants ?? undefined,
        participantIcgIds: original.participantIcgIds,
        participantNamesNorm: original.participantNamesNorm,
        participantStatuses: original.participantStatuses ?? undefined,
        importBatchId: original.importBatchId,
        importItemId: original.importItemId,   // shared — unique by (importItemId, isVideo=false)
        subjectPersonId: original.subjectPersonId,
        subjectIcgId: original.subjectIcgId,
        isDuplicate: original.isDuplicate,
        status: original.status,
        priority: original.priority,
        notes: original.notes,
      },
    })
    console.log(`  Created photo sibling: ${photoSibling.id}`)

    // 2. Update original: clear imageCount, point to photo sibling
    await prisma.stagingSet.update({
      where: { id: original.id },
      data: { imageCount: null, siblingId: photoSibling.id },
    })
    console.log(`  Updated original to video set (imageCount=null, siblingId=${photoSibling.id})`)

    // 3. Reassign photo-folder archive links to the photo sibling
    for (const link of original.archiveLinks) {
      if (link.archiveFolder && !link.archiveFolder.isVideo) {
        await prisma.archiveLink.update({
          where: { id: link.id },
          data: { stagingSetId: photoSibling.id },
        })
        console.log(`  Moved archive link ${link.id} (photo folder) → photo sibling`)
      } else {
        console.log(`  Left archive link ${link.id} (video folder or no folder) on video set`)
      }
    }
  }

  console.log('\nDone.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
