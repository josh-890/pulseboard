'use client'

import Link from 'next/link'
import { Camera, Film, ExternalLink, CheckCircle2 } from 'lucide-react'
import type { ArchiveFolderEntry } from '@/lib/services/archive-service'

// Evaluated once at module load — accurate enough for a 7-day display badge
const MODULE_LOAD_TIME_MS = Date.now()
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

type Props = {
  item: ArchiveFolderEntry
}

export function ArchiveLinkedRow({ item }: Props) {
  const dateStr = item.parsedDate
    ? new Date(item.parsedDate).toISOString().split('T')[0]
    : null

  const isRecentlyRenamed =
    item.lastRenamedAt != null &&
    MODULE_LOAD_TIME_MS - new Date(item.lastRenamedAt).getTime() < SEVEN_DAYS_MS

  const linkedHref = item.linkedSetId
    ? `/sets/${item.linkedSetId}`
    : item.linkedStagingId
    ? `/staging-sets?selected=${item.linkedStagingId}`
    : null

  const linkedType = item.linkedSetId ? 'set' : 'staging'

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/70 px-4 py-3 shadow-sm backdrop-blur-sm">
      {/* Linked indicator */}
      <CheckCircle2 size={14} className="shrink-0 text-green-500" />

      {/* Type icon */}
      <span className="shrink-0 text-muted-foreground/60">
        {item.isVideo ? <Film size={14} /> : <Camera size={14} />}
      </span>

      {/* Date */}
      {dateStr && (
        <span className="w-28 shrink-0 text-xs text-muted-foreground">{dateStr}</span>
      )}

      {/* Short name */}
      {item.parsedShortName && (
        <span className="shrink-0 rounded-full bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {item.parsedShortName}
        </span>
      )}

      {/* Folder name */}
      <span className="min-w-0 flex-1 truncate text-sm font-medium" title={item.folderName}>
        {item.folderName}
      </span>

      {/* File count */}
      {item.fileCount != null && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {item.fileCount} {item.isVideo ? 'frames' : 'pics'}
          {item.isVideo && (
            <span className={item.videoPresent ? 'ml-1 text-green-500' : 'ml-1 text-red-500'}>
              · video {item.videoPresent ? 'ok' : 'missing'}
            </span>
          )}
        </span>
      )}

      {/* Rename badge */}
      {isRecentlyRenamed && item.lastRenamedFrom && (
        <span
          title={`Renamed from: ${item.lastRenamedFrom}`}
          className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
        >
          renamed
        </span>
      )}

      {/* Linked type badge */}
      <span className={
        linkedType === 'set'
          ? 'shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400'
          : 'shrink-0 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400'
      }>
        {linkedType}
      </span>

      {/* Navigate to linked record */}
      {linkedHref && (
        <Link
          href={linkedHref}
          target={linkedType === 'set' ? '_blank' : undefined}
          className="shrink-0 text-muted-foreground/50 hover:text-foreground"
          title="Open linked record"
        >
          <ExternalLink size={14} />
        </Link>
      )}
    </div>
  )
}
