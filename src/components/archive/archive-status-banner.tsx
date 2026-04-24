'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { FolderCheck, FolderX, Link2, FolderSearch, Check, X } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import { confirmArchiveFolderLinkAction, rejectArchiveSuggestionAction } from '@/lib/actions/archive-actions'

// ─── Types ─────────────────────────────────────────────────────────────────────

type ArchiveStatusBannerProps = {
  // Confirmed link state
  archiveStatus?: string | null         // OK | MISSING | CHANGED | INCOMPLETE | LINKED | PENDING | UNKNOWN
  folderName?: string | null
  fileCount?: number | null
  lastChecked?: Date | string | null
  archiveFolderId?: string | null       // for "→ Archive" deep-link

  // Suggestion state (no confirmed link yet)
  suggestedFolder?: {
    folderId: string
    folderName: string
    fileCount: number | null
    confidence: 'HIGH' | 'MEDIUM'
  } | null
  stagingSetId?: string | null          // needed for confirm/reject server actions

  // Not-linked state
  expectedPath?: string | null

  // Picker trigger (for "Link folder…" button)
  onPickerOpen?: () => void
  /** Called after a confirm/reject action completes — use to refresh parent data */
  onArchiveChange?: () => void
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CONFIRMED_STATUSES = new Set(['OK', 'LINKED', 'CHANGED', 'MISSING', 'INCOMPLETE'])

const STATUS_CHIP_LABELS: Record<string, string> = {
  OK: 'OK',
  LINKED: 'Linked',
  CHANGED: 'Changed',
  MISSING: 'Missing',
  INCOMPLETE: 'Incomplete',
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ArchiveStatusBanner({
  archiveStatus,
  folderName,
  fileCount,
  lastChecked,
  archiveFolderId,
  suggestedFolder,
  stagingSetId,
  expectedPath,
  onPickerOpen,
  onArchiveChange,
}: ArchiveStatusBannerProps) {
  const [isConfirming, startConfirm] = useTransition()
  const [isRejecting, startReject] = useTransition()

  const isConfirmed = archiveStatus != null && CONFIRMED_STATUSES.has(archiveStatus)

  // ── Branch A — confirmed link ──────────────────────────────────────────────
  if (isConfirmed) {
    const isMissing = archiveStatus === 'MISSING'

    const borderClass =
      archiveStatus === 'OK' || archiveStatus === 'LINKED' ? 'border-l-green-500' :
      archiveStatus === 'CHANGED'    ? 'border-l-amber-500' :
      archiveStatus === 'MISSING'    ? 'border-l-red-500' :
      /* INCOMPLETE */                 'border-l-orange-500'

    const bgClass =
      archiveStatus === 'OK' || archiveStatus === 'LINKED' ? 'bg-green-500/10' :
      archiveStatus === 'CHANGED'    ? 'bg-amber-500/10' :
      archiveStatus === 'MISSING'    ? 'bg-red-500/10' :
      'bg-orange-500/10'

    const iconColorClass =
      archiveStatus === 'OK' || archiveStatus === 'LINKED' ? 'text-green-600 dark:text-green-400' :
      archiveStatus === 'CHANGED'    ? 'text-amber-600 dark:text-amber-400' :
      archiveStatus === 'MISSING'    ? 'text-red-600 dark:text-red-400' :
      'text-orange-600 dark:text-orange-400'

    const chipClass =
      archiveStatus === 'OK' || archiveStatus === 'LINKED' ? 'bg-green-500/15 text-green-600 dark:text-green-400' :
      archiveStatus === 'CHANGED'    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
      archiveStatus === 'MISSING'    ? 'bg-red-500/15 text-red-600 dark:text-red-400' :
      'bg-orange-500/15 text-orange-600 dark:text-orange-400'

    const checkedDate = lastChecked
      ? (lastChecked instanceof Date ? lastChecked : new Date(lastChecked as string))
      : null

    return (
      <div className={cn('border-l-4 rounded-lg px-3 py-2.5', borderClass, bgClass)}>
        {/* Row 1: icon + title + chip */}
        <div className="flex items-center justify-between gap-2">
          <div className={cn('flex items-center gap-1.5', iconColorClass)}>
            {isMissing
              ? <FolderX size={14} className="shrink-0" />
              : <FolderCheck size={14} className="shrink-0" />
            }
            <span className="text-xs font-medium">
              {isMissing ? 'Archive folder missing' : 'Archive linked'}
            </span>
          </div>
          <span className={cn('shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium', chipClass)}>
            {STATUS_CHIP_LABELS[archiveStatus] ?? archiveStatus}
          </span>
        </div>

        {/* Row 2: folder name · file count · last scan */}
        {(folderName || fileCount != null || checkedDate) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {folderName && <span className="truncate font-medium max-w-[200px]" title={folderName}>{folderName}</span>}
            {folderName && fileCount != null && <span className="opacity-40">·</span>}
            {fileCount != null && <span className="shrink-0">{fileCount} files</span>}
            {(folderName || fileCount != null) && checkedDate && <span className="opacity-40">·</span>}
            {checkedDate && <span className="shrink-0">{formatRelativeTime(checkedDate)}</span>}
          </div>
        )}

        {/* Row 3: → Archive deep-link */}
        {archiveFolderId && (
          <div className="mt-1.5 flex justify-end">
            <Link
              href={`/archive?highlight=${archiveFolderId}`}
              className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              → Archive
            </Link>
          </div>
        )}
      </div>
    )
  }

  // ── Branch B — suggestion ──────────────────────────────────────────────────
  if (suggestedFolder) {
    const isHigh = suggestedFolder.confidence === 'HIGH'

    return (
      <div className={cn(
        'border-l-4 rounded-lg px-3 py-2.5',
        isHigh
          ? 'border-l-amber-500 bg-amber-500/10'
          : 'border-l-amber-400/70 bg-amber-400/[0.08]',
      )}>
        {/* Row 1: icon + title + confidence chip */}
        <div className="flex items-center justify-between gap-2">
          <div className={cn(
            'flex items-center gap-1.5',
            isHigh ? 'text-amber-600 dark:text-amber-400' : 'text-amber-500/80 dark:text-amber-400/70',
          )}>
            <Link2 size={13} className="shrink-0" />
            <span className="text-xs font-medium">Archive suggestion</span>
          </div>
          <span className={cn(
            'shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium',
            isHigh
              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              : 'bg-amber-400/10 text-amber-500/80 dark:text-amber-400/60',
          )}>
            {isHigh ? '✓ date+code' : '~ title match'}
          </span>
        </div>

        {/* Row 2: folder name · file count */}
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="truncate font-medium">{suggestedFolder.folderName}</span>
          {suggestedFolder.fileCount != null && (
            <>
              <span className="opacity-40">·</span>
              <span className="shrink-0">{suggestedFolder.fileCount} files</span>
            </>
          )}
        </div>

        {/* Row 3: Confirm / Skip */}
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            disabled={isConfirming || isRejecting || !stagingSetId}
            onClick={() => {
              startConfirm(async () => {
                await confirmArchiveFolderLinkAction(suggestedFolder.folderId, stagingSetId!, 'staging')
                onArchiveChange?.()
              })
            }}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
              'bg-green-500/15 text-green-700 hover:bg-green-500/30 dark:text-green-400',
              'disabled:pointer-events-none disabled:opacity-40',
            )}
          >
            <Check size={11} />
            Confirm
          </button>
          <button
            type="button"
            disabled={isConfirming || isRejecting}
            onClick={() => {
              startReject(async () => {
                await rejectArchiveSuggestionAction(suggestedFolder.folderId)
                onArchiveChange?.()
              })
            }}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
              'bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400',
              'disabled:pointer-events-none disabled:opacity-40',
            )}
          >
            <X size={11} />
            Skip
          </button>
        </div>
      </div>
    )
  }

  // ── Branch C — not linked ──────────────────────────────────────────────────
  if (expectedPath || onPickerOpen) {
    return (
      <div className="border-l-4 border-l-border rounded-lg px-3 py-2.5 bg-muted/30">
        {/* Row 1: icon + title */}
        <div className="flex items-center gap-1.5 text-muted-foreground/70">
          <FolderX size={13} className="shrink-0" />
          <span className="text-xs font-medium">No archive folder linked</span>
        </div>

        {/* Row 2: expected path */}
        {expectedPath && (
          <div className="mt-1 text-[11px] text-muted-foreground/50 truncate" title={expectedPath}>
            Expected: {expectedPath}
          </div>
        )}

        {/* Row 3: Link folder button */}
        {onPickerOpen && (
          <div className="mt-2">
            <button
              type="button"
              onClick={onPickerOpen}
              className={cn(
                'flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
                'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <FolderSearch size={11} />
              Link folder…
            </button>
          </div>
        )}
      </div>
    )
  }

  return null
}
