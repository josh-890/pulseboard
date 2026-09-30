/**
 * Stub archive folders (ADR-0032) — marking, ending, and what ending sets off.
 *
 * The flag sits on the ArchiveFolder: the publication is complete, only the copy
 * on disk is a placeholder. Either side may set or end it; `reconcileStub`
 * (lib/archive-stub.ts) decides between the app and `.pulseboard\STUB`, and the
 * app side of both directions comes through here.
 */

import { prisma } from '@/lib/db'
import { clearArchiveFolderCover } from '@/lib/services/archive-cover-service'
import type { StubReason } from '@/generated/prisma/client'

export type MarkStubInput = { reason: StubReason; note?: string | null }

/** Mark (or re-describe) a folder as a stub. Keeps the original date on an edit. */
export async function markArchiveFolderStub(folderId: string, input: MarkStubInput): Promise<void> {
  const folder = await prisma.archiveFolder.findUniqueOrThrow({
    where: { id: folderId },
    select: { stubSince: true },
  })
  const note = input.note?.trim() || null
  await prisma.archiveFolder.update({
    where: { id: folderId },
    data: { stubSince: folder.stubSince ?? new Date(), stubReason: input.reason, stubNote: note },
  })
}

/**
 * End a stub — the media in the folder are the real set now. The same whichever
 * side ended it (ADR-0032 §6): the folder cover, a thumbnail of the stub media, is
 * reset so the cover agent rebuilds it, and `stubEndedAt` raises the offer to
 * re-import the set's media until it is dismissed.
 */
export async function endArchiveFolderStub(folderId: string): Promise<void> {
  const folder = await prisma.archiveFolder.findUniqueOrThrow({
    where: { id: folderId },
    select: { stubSince: true },
  })
  if (!folder.stubSince) return
  await prisma.archiveFolder.update({
    where: { id: folderId },
    data: { stubSince: null, stubReason: null, stubNote: null, stubEndedAt: new Date() },
  })
  await clearArchiveFolderCover(folderId)
}

/** The "re-import media" offer has been taken or declined. */
export async function dismissStubEnded(folderId: string): Promise<void> {
  await prisma.archiveFolder.update({ where: { id: folderId }, data: { stubEndedAt: null } })
}
