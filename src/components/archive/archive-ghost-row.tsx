'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Camera, Film, AlertTriangle, ExternalLink, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GhostEntry } from '@/lib/services/archive-service'
import { deleteArchiveFolderAction } from '@/lib/actions/archive-actions'

type Props = {
  item: GhostEntry
}

export function ArchiveGhostRow({ item }: Props) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const dateStr = item.parsedDate
    ? new Date(item.parsedDate).toISOString().split('T')[0]
    : null

  const lastSeenStr = new Date(item.scannedAt).toISOString().split('T')[0]

  const isLinked = !!(item.linkedSetId || item.linkedStagingId)
  const linkedHref = item.linkedSetId
    ? `/sets/${item.linkedSetId}`
    : item.linkedStagingId
      ? `/staging-sets?selected=${item.linkedStagingId}`
      : null
  const linkedTitle = item.linkedSetTitle ?? item.linkedStagingTitle

  function handleDelete() {
    startTransition(async () => {
      await deleteArchiveFolderAction(item.id)
      router.refresh()
    })
  }

  return (
    <div className={cn(
      'flex flex-col gap-1 rounded-xl border px-4 py-2.5 shadow-sm backdrop-blur-sm transition-all',
      isLinked
        ? 'border-red-500/40 bg-red-500/8'
        : 'border-border/40 bg-card/70',
      pending && 'opacity-60',
    )}>
      {/* Main row */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Ghost indicator */}
        <AlertTriangle
          size={14}
          className={cn('shrink-0', isLinked ? 'text-red-500' : 'text-muted-foreground/50')}
        />

        {/* Type icon */}
        <span className="shrink-0 text-muted-foreground/60">
          {item.isVideo ? <Film size={14} /> : <Camera size={14} />}
        </span>

        {/* Parsed date */}
        {dateStr && (
          <span className="w-28 shrink-0 text-xs text-muted-foreground">{dateStr}</span>
        )}

        {/* Folder name */}
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={item.folderName}>
          {item.folderName}
        </span>

        {/* File count */}
        {item.fileCount != null && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {item.fileCount} {item.isVideo ? 'frames' : 'pics'}
          </span>
        )}

        {/* Last seen */}
        <span className={cn(
          'shrink-0 text-[11px]',
          isLinked ? 'text-red-500/70' : 'text-muted-foreground/50',
        )}>
          last seen {lastSeenStr}
        </span>

        {/* Linked badge */}
        {isLinked && (
          <span className="shrink-0 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
            linked
          </span>
        )}

        {/* Delete */}
        <button
          type="button"
          disabled={pending}
          onClick={handleDelete}
          title={isLinked ? 'Delete record (will also unlink the linked Set)' : 'Delete stale record'}
          className="shrink-0 text-muted-foreground/30 transition-colors hover:text-red-500"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Full path */}
      <div className="truncate pl-5 text-[11px] text-muted-foreground/50" title={item.fullPath}>
        {item.fullPath}
      </div>

      {/* Linked Set/StagingSet info */}
      {isLinked && linkedTitle && linkedHref && (
        <div className="flex items-center gap-2 pl-5">
          <span className="min-w-0 truncate text-[11px] font-medium text-red-600 dark:text-red-400">
            {linkedTitle}
          </span>
          <Link
            href={linkedHref}
            target={item.linkedSetId ? '_blank' : undefined}
            className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors"
            title="Open linked record"
          >
            <ExternalLink size={11} />
          </Link>
        </div>
      )}
    </div>
  )
}
