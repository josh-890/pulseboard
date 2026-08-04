import type { Prisma } from '@/generated/prisma/client'

/**
 * A folder is settled only when a human confirmed its link — not when the matcher
 * guessed one.
 *
 * The attribution pipeline used to exclude any folder carrying an `ArchiveLink`
 * at all, `SUGGESTED` included. That treated a machine guess as a decision, and
 * the two failure modes compounded: a wrong suggestion removed the folder from
 * the only view that could contradict it. Measured on xpulse before this changed:
 * **2,733 folders were hidden this way, 14 % of their suggestions agreed with the
 * folder on neither date nor title, and 0 of them had ever been sent to the
 * catalogue agent** — because its worklist used the same filter.
 *
 * Every query that asks "which folders still need a person" must use this.
 */
export const UNSETTLED_FOLDER: Prisma.ArchiveFolderWhereInput = {
  missingOnDisk: false,
  OR: [{ archiveLink: null }, { archiveLink: { status: { not: 'CONFIRMED' } } }],
}
