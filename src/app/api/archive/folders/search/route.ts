/**
 * GET /api/archive/folders/search
 *
 * Search unlinked archive folders for the manual linking picker.
 * Query params:
 *   q          — free-text search on folderName/parsedTitle
 *   shortName  — filter by chanFolderName (partial, case-insensitive)
 *   year       — filter by parsedDate year
 *   limit      — max results (default 20)
 */

import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { prisma } from '@/lib/db'
import { ArchiveLinkStatus } from '@/generated/prisma/client'
import type { Prisma } from '@/generated/prisma/client'

export async function GET(request: Request) {
  return withTenantFromHeaders(async () => {
    try {
      const url = new URL(request.url)
      const q = url.searchParams.get('q')?.trim() ?? ''
      const shortName = url.searchParams.get('shortName')?.trim() ?? ''
      const yearParam = url.searchParams.get('year')
      const year = yearParam ? parseInt(yearParam, 10) : null
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 50)

      const where: Prisma.ArchiveFolderWhereInput = {
        // Only return folders without a CONFIRMED link — candidates for manual linking
        OR: [
          { archiveLink: { is: null } },
          { archiveLink: { status: { not: ArchiveLinkStatus.CONFIRMED } } },
        ],
      }

      const andConditions: Prisma.ArchiveFolderWhereInput[] = []

      if (shortName) {
        andConditions.push({
          chanFolderName: { contains: shortName, mode: 'insensitive' },
        })
      }

      if (year !== null && !isNaN(year)) {
        const yearStart = new Date(year, 0, 1)
        const yearEnd = new Date(year + 1, 0, 1)
        andConditions.push({
          parsedDate: { gte: yearStart, lt: yearEnd },
        })
      }

      if (q) {
        andConditions.push({
          OR: [
            { folderName: { contains: q, mode: 'insensitive' } },
            { parsedTitle: { contains: q, mode: 'insensitive' } },
          ],
        })
      }

      if (andConditions.length > 0) {
        where.AND = andConditions
      }

      const folders = await prisma.archiveFolder.findMany({
        where,
        select: {
          id: true,
          folderName: true,
          fileCount: true,
          parsedDate: true,
          fullPath: true,
          isVideo: true,
          parsedShortName: true,
          chanFolderName: true,
        },
        orderBy: [{ parsedDate: 'desc' }, { folderName: 'asc' }],
        take: limit,
      })

      return NextResponse.json(folders)
    } catch (err) {
      console.error('Archive folder search error:', err)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }
  })
}
