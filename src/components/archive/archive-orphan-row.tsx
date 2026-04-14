'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Camera, Film, Check, X, Plus, ExternalLink, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ArchiveFolderEntry } from '@/lib/services/archive-service'
import {
  confirmArchiveFolderLinkAction,
  rejectArchiveSuggestionAction,
  createStagingSetFromOrphanAction,
} from '@/lib/actions/archive-actions'

type Props = {
  item: ArchiveFolderEntry
}

export function ArchiveOrphanRow({ item }: Props) {
  const [pending, startTransition] = useTransition()
  const [dismissed, setDismissed] = useState(false)
  const router = useRouter()

  const dateStr = item.parsedDate
    ? new Date(item.parsedDate).toISOString().split('T')[0]
    : null

  const hasSuggestion = !!(item.suggestedSetId || item.suggestedStagingId)
  const suggestedId = item.suggestedSetId ?? item.suggestedStagingId
  const suggestedType = item.suggestedSetId ? 'set' : 'staging'
  const suggestedTitle = item.suggestedSetTitle ?? item.suggestedStagingTitle

  function handleConfirmSuggestion() {
    if (!suggestedId) return
    startTransition(async () => {
      await confirmArchiveFolderLinkAction(item.id, suggestedId, suggestedType)
      router.refresh()
    })
  }

  function handleRejectSuggestion() {
    startTransition(async () => {
      await rejectArchiveSuggestionAction(item.id)
      setDismissed(true)
    })
  }

  function handleCreateStagingSet() {
    startTransition(async () => {
      const result = await createStagingSetFromOrphanAction(item.id)
      if (result.success && result.stagingSetId) {
        router.push(`/staging-sets?selected=${result.stagingSetId}`)
      }
    })
  }

  const hasMismatch = !!(item.parsedShortName && item.chanFolderName &&
    !item.chanFolderName.toLowerCase().startsWith(item.parsedShortName.toLowerCase() + '-') &&
    item.chanFolderName.toLowerCase() !== item.parsedShortName.toLowerCase())
  const hasWarning = hasMismatch || !item.nameFormatOk

  return (
    <div className={cn(
      'flex flex-col gap-2 rounded-xl border px-4 py-3 shadow-sm backdrop-blur-sm transition-all',
      hasMismatch
        ? 'border-red-500/30 bg-red-500/8'
        : hasWarning
        ? 'border-orange-500/25 bg-orange-500/6'
        : 'border-border/40 bg-card/70',
      pending && 'opacity-60',
    )}>
      {/* Main row */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Type icon */}
        <span className="shrink-0 text-muted-foreground/60">
          {item.isVideo ? <Film size={14} /> : <Camera size={14} />}
        </span>

        {/* Parsed date */}
        {dateStr && (
          <span className="w-28 shrink-0 text-xs text-muted-foreground">{dateStr}</span>
        )}

        {/* Parsed short name */}
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
              <span className={cn('ml-1', item.videoPresent ? 'text-green-500' : 'text-red-500')}>
                · video {item.videoPresent ? 'ok' : 'missing'}
              </span>
            )}
          </span>
        )}

        {/* Shortname/channel folder mismatch — highest priority warning */}
        {hasMismatch && (
          <span
            title={`Code mismatch: folder name says "${item.parsedShortName}" but channel folder is "${item.chanFolderName}"`}
            className="shrink-0 flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400"
          >
            <TriangleAlert size={11} />
            {item.parsedShortName} ≠ {item.chanFolderName}
          </span>
        )}

        {/* Non-standard name format warning */}
        {!item.nameFormatOk && (
          <span
            title="Folder name does not follow the canonical format: YYYY-MM-DD-CODE Name - Title"
            className="shrink-0 flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-medium text-orange-600 dark:text-orange-400"
          >
            <TriangleAlert size={9} />
            format
          </span>
        )}

        {/* Create staging set */}
        <button
          type="button"
          disabled={pending}
          onClick={handleCreateStagingSet}
          title="Create staging set from this folder"
          className="shrink-0 flex items-center gap-1 rounded-md border border-border/50 bg-muted/40 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
        >
          <Plus size={11} />
          Create
        </button>
      </div>

      {/* Full path — subdued */}
      <div className="truncate pl-5 text-[11px] text-muted-foreground/50" title={item.fullPath}>
        {item.fullPath}
      </div>

      {/* Suggestion banner */}
      {hasSuggestion && !dismissed && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <span className="min-w-0 flex-1 text-xs text-amber-600 dark:text-amber-400">
            Possible match:{' '}
            <span className="font-medium">{suggestedTitle ?? suggestedId}</span>
            {' '}
            <span className="opacity-60">({suggestedType})</span>
          </span>
          {suggestedType === 'set' && item.suggestedSetId && (
            <Link
              href={`/sets/${item.suggestedSetId}`}
              target="_blank"
              className="shrink-0 text-muted-foreground/50 hover:text-foreground"
              title="Open set"
            >
              <ExternalLink size={12} />
            </Link>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={handleConfirmSuggestion}
            title="Confirm link"
            className="shrink-0 flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30 transition-colors"
          >
            <Check size={11} /> Confirm
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={handleRejectSuggestion}
            title="Dismiss suggestion"
            className="shrink-0 text-muted-foreground/40 hover:text-red-500 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
