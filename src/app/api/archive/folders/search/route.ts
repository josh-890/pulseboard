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
 *   shortName  — filter by chanFolderName (partial, case-insensitive)
 *   year       — filter by parsedDate year
 *   limit      — max results per list (default 20, max 50)
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

      // Shared content filters (shortName, year, free-text)
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

      const sharedSelect = {
        id: true,
        folderName: true,
        fileCount: true,
        parsedDate: true,
        fullPath: true,
        isVideo: true,
        parsedShortName: true,
        chanFolderName: true,
      } satisfies Prisma.ArchiveFolderSelect

      const [unlinkedFolders, linkedFolders] = await Promise.all([
        // Unlinked: no link at all, or only a SUGGESTED link
        prisma.archiveFolder.findMany({
          where: {
            OR: [
              { archiveLink: { is: null } },
              { archiveLink: { status: { not: ArchiveLinkStatus.CONFIRMED } } },
            ],
            ...(andConditions.length > 0 ? { AND: andConditions } : {}),
          },
          select: sharedSelect,
          orderBy: [{ parsedDate: 'desc' }, { folderName: 'asc' }],
          take: limit,
        }),

        // Linked: CONFIRMED to another entity — shown so user can re-assign
        prisma.archiveFolder.findMany({
          where: {
            archiveLink: { status: ArchiveLinkStatus.CONFIRMED },
            ...(andConditions.length > 0 ? { AND: andConditions } : {}),
          },
          select: {
            ...sharedSelect,
            archiveLink: {
              select: {
                stagingSet: { select: { title: true, status: true } },
                set: { select: { title: true } },
              },
            },
          },
          orderBy: [{ parsedDate: 'desc' }, { folderName: 'asc' }],
          take: limit,
        }),
      ])

      const linked = linkedFolders.map((f) => ({
        id: f.id,
        folderName: f.folderName,
        fileCount: f.fileCount,
        parsedDate: f.parsedDate,
        fullPath: f.fullPath,
        isVideo: f.isVideo,
        parsedShortName: f.parsedShortName,
        chanFolderName: f.chanFolderName,
        currentTargetType: (f.archiveLink?.stagingSet ? 'stagingSet' : 'set') as 'stagingSet' | 'set',
        currentTargetTitle: f.archiveLink?.stagingSet?.title ?? f.archiveLink?.set?.title ?? null,
        currentTargetStatus: f.archiveLink?.stagingSet?.status ?? null,
      }))

      return NextResponse.json({ unlinked: unlinkedFolders, linked })
    } catch (err) {
      console.error('Archive folder search error:', err)
      return NextResponse.json({ error: 'Search failed' }, { status: 500 })
    }
  })
}
