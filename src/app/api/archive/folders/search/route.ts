/**
 * GET /api/archive/folders/search
 *
 * Search archive folders for the manual linking picker.
 * Returns two lists:
 *   unlinked — folders with no link or only a SUGGESTED link (available to link)
 *   linked   — folders already CONFIRMED to another set (available to re-assign)
 *
 * Query params:
 *   q          — free-text search on folderName/parsedTitle
 *   shortName  — filter by chanFolderName (partial) OR parsedShortName (exact),
 *                case-insensitive. Handles multiple archive roots where chanFolderName
 *                may be null for shallow paths.
 *   year       — filter by parsedDate year
 *   limit      — max results per list (default 20, max 50)
 *
 * Implementation note: uses $queryRaw instead of findMany() to avoid a Prisma ORM
 * issue where relation filters on archive_folder return empty results in production.
 * Raw SQL is consistent with how getConflictingLinkIds() works in archive-service.ts.
 */

import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { prisma } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'

type FolderRow = {
  id: string
  folderName: string
  fileCount: number | null
  parsedDate: Date | null
  fullPath: string
  isVideo: boolean
  parsedShortName: string | null
  chanFolderName: string | null
}

type LinkedFolderRow = FolderRow & {
  stagingSetTitle: string | null
  stagingSetStatus: string | null
  setTitle: string | null
}

export async function GET(request: Request) {
  return withTenantFromHeaders(async () => {
    try {
      const url = new URL(request.url)
      const q = url.searchParams.get('q')?.trim() ?? ''
      const shortName = url.searchParams.get('shortName')?.trim() ?? ''
      const yearParam = url.searchParams.get('year')
      const year = yearParam ? parseInt(yearParam, 10) : null
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 50)
      const isVideoParam = url.searchParams.get('isVideo')
      const isVideoFilter = isVideoParam === 'true' ? true : isVideoParam === 'false' ? false : null

      // Build shared SQL filter fragments (shortName, year, isVideo, free-text).
      // Each fragment is injected after a WHERE clause that already has a condition,
      // so every fragment is prefixed with AND.
      const filters: Prisma.Sql[] = []

      if (isVideoFilter !== null) {
        filters.push(Prisma.sql`AND af."isVideo" = ${isVideoFilter}`)
      }

      if (shortName) {
        // Match chanFolderName (path segment, e.g. "NBL-Nubiles") OR parsedShortName
        // (extracted from folder name, e.g. "NBL"). chanFolderName may be null when
        // multiple archive roots are configured and paths are shallow — falling back to
        // parsedShortName ensures those folders still appear in the linked section.
        filters.push(
          Prisma.sql`AND (af."chanFolderName" ILIKE ${`%${shortName}%`} OR af."parsedShortName" ILIKE ${shortName})`,
        )
      }

      if (year !== null && !isNaN(year)) {
        filters.push(Prisma.sql`AND EXTRACT(YEAR FROM af."parsedDate") = ${year}`)
      }

      if (q) {
        filters.push(
          Prisma.sql`AND (af."folderName" ILIKE ${`%${q}%`} OR af."parsedTitle" ILIKE ${`%${q}%`})`,
        )
      }

      // Combine all filter fragments into one Sql value (or empty if none)
      const whereFilters =
        filters.length > 0 ? Prisma.join(filters, ' ') : Prisma.sql``

      const [unlinkedRows, linkedRows] = await Promise.all([
        // Unlinked: no ArchiveLink at all, or only a SUGGESTED link
        prisma.$queryRaw<FolderRow[]>`
          SELECT af.id,
                 af."folderName",
                 af."fileCount",
                 af."parsedDate",
                 af."fullPath",
                 af."isVideo",
                 af."parsedShortName",
                 af."chanFolderName"
          FROM   "archive_folder" af
          LEFT   JOIN "ArchiveLink" al ON al."archiveFolderId" = af.id
          WHERE  (al.id IS NULL OR al.status != 'CONFIRMED')
          ${whereFilters}
          ORDER  BY af."parsedDate" DESC NULLS LAST, af."folderName" ASC
          LIMIT  ${limit}
        `,

        // Linked: CONFIRMED to another entity — shown so user can re-assign
        prisma.$queryRaw<LinkedFolderRow[]>`
          SELECT af.id,
                 af."folderName",
                 af."fileCount",
                 af."parsedDate",
                 af."fullPath",
                 af."isVideo",
                 af."parsedShortName",
                 af."chanFolderName",
                 ss.title     AS "stagingSetTitle",
                 ss.status    AS "stagingSetStatus",
                 s.title      AS "setTitle"
          FROM   "archive_folder" af
          INNER  JOIN "ArchiveLink" al ON al."archiveFolderId" = af.id AND al.status = 'CONFIRMED'
          LEFT   JOIN staging_set ss   ON ss.id = al."stagingSetId"
          LEFT   JOIN "Set"        s   ON s.id  = al."setId"
          WHERE  TRUE
          ${whereFilters}
          ORDER  BY af."parsedDate" DESC NULLS LAST, af."folderName" ASC
          LIMIT  ${limit}
        `,
      ])

      const linked = linkedRows.map((f) => ({
        id: f.id,
        folderName: f.folderName,
        fileCount: f.fileCount,
        parsedDate: f.parsedDate,
        fullPath: f.fullPath,
        isVideo: f.isVideo,
        parsedShortName: f.parsedShortName,
        chanFolderName: f.chanFolderName,
        currentTargetType: (f.stagingSetTitle !== null ? 'stagingSet' : 'set') as 'stagingSet' | 'set',
        currentTargetTitle: f.stagingSetTitle ?? f.setTitle ?? null,
        currentTargetStatus: f.stagingSetStatus ?? null,
      }))

      return NextResponse.json({ unlinked: unlinkedRows, linked })
    } catch (err) {
      console.error('Archive folder search error:', err)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }
  })
}
