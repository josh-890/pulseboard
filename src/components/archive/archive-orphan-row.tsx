'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Camera, Film, Check, X, Plus, ExternalLink, TriangleAlert, Trash2, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ArchiveFolderEntry } from '@/lib/services/archive-service'
import {
  confirmArchiveFolderLinkAction,
  rejectArchiveSuggestionAction,
  createStagingSetFromOrphanAction,
  deleteArchiveFolderAction,
} from '@/lib/actions/archive-actions'
import { ArchiveSetPicker } from './archive-set-picker'

type Props = {
  item: ArchiveFolderEntry
}

export function ArchiveOrphanRow({ item }: Props) {
  const [pending, startTransition] = useTransition()
  const [dismissed, setDismissed] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const router = useRouter()

  const dateStr = item.parsedDate
    ? new Date(item.parsedDate).toISOString().split('T')[0]
    : null

  const hasSuggestion = !!(item.suggestedSetId || item.suggestedStagingId)
  const suggestedId = item.suggestedSetId ?? item.suggestedStagingId
  const suggestedType = item.suggestedSetId ? 'set' : 'staging'
  const suggestedTitle    = item.suggestedSetTitle    ?? item.suggestedStagingTitle
  const suggestedDate     = item.suggestedSetDate     ?? item.suggestedStagingDate
  const suggestedChannel  = item.suggestedSetChannel  ?? item.suggestedStagingChannel
  const suggestedPeople   = item.suggestedSetParticipants.length > 0
    ? item.suggestedSetParticipants
    : item.suggestedStagingParticipants
  const suggestedDateStr  = suggestedDate
    ? new Date(suggestedDate).toISOString().split('T')[0]
    : null

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

  function handleDelete() {
    startTransition(async () => {
      await deleteArchiveFolderAction(item.id)
      router.refresh()
    })
  }

  const hasMismatch = !!(item.parsedShortName && item.chanFolderName &&
    !item.chanFolderName.toLowerCase().startsWith(item.parsedShortName.toLowerCase() + '-') &&
    item.chanFolderName.toLowerCase() !== item.parsedShortName.toLowerCase())
  const hasWarning = hasMismatch || !item.nameFormatOk

  return (
    <div className={cn(
      'flex flex-col gap-1.5 rounded-xl border px-4 py-2.5 shadow-sm backdrop-blur-sm transition-all',
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

        {/* Shortname/channel folder mismatch */}
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

        {/* Possible match — confidence dot indicator in main row */}
        {hasSuggestion && !dismissed && (
          <span
            title={item.suggestedConfidence === 'HIGH' ? 'Exact match found — see below' : 'Approximate match found — see below'}
            className={cn(
              'shrink-0 h-1.5 w-1.5 rounded-full',
              item.suggestedConfidence === 'HIGH' ? 'bg-green-500/80' : 'bg-amber-500/70',
            )}
          />
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

        {/* Link to existing set / staging set */}
        <button
          type="button"
          disabled={pending}
          onClick={() => setPickerOpen(true)}
          title="Link to an existing set or staging set"
          className="shrink-0 flex items-center gap-1 rounded-md border border-border/50 bg-muted/40 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
        >
          <Link2 size={11} />
          Link to…
        </button>

        {/* Delete stale record */}
        <button
          type="button"
          disabled={pending}
          onClick={handleDelete}
          title="Delete this scan record (safe — rescan will recreate it)"
          className="shrink-0 text-muted-foreground/30 transition-colors hover:text-red-500"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Full path — subdued */}
      <div className="truncate pl-5 text-[11px] text-muted-foreground/50" title={item.fullPath}>
        {item.fullPath}
      </div>

      {/* Suggestion detail row */}
      {hasSuggestion && !dismissed && (
        <div className="flex items-center gap-2 pl-5 min-w-0">
          {/* Title */}
          <span
            className={cn(
              'min-w-0 truncate text-[11px] font-medium',
              item.suggestedConfidence === 'HIGH'
                ? 'text-green-600 dark:text-green-400'
                : 'text-amber-600 dark:text-amber-400',
            )}
            title={suggestedTitle ?? suggestedId ?? ''}
          >
            {suggestedTitle ?? suggestedId}
          </span>

          {/* Date */}
          {suggestedDateStr && (
            <span className="shrink-0 text-[10px] text-muted-foreground/60">{suggestedDateStr}</span>
          )}

          {/* Channel */}
          {suggestedChannel && (
            <span className="shrink-0 rounded-full bg-muted/50 px-1.5 py-px text-[10px] text-muted-foreground">
              {suggestedChannel}
            </span>
          )}

          {/* Participants */}
          {suggestedPeople.length > 0 && (
            <span className="shrink-0 text-[10px] text-muted-foreground/70">
              {suggestedPeople.join(', ')}
            </span>
          )}

          <span className="flex-1" />

          {/* Confidence badge */}
          <span className={cn(
            'shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium',
            item.suggestedConfidence === 'HIGH'
              ? 'bg-green-500/15 text-green-600 dark:text-green-400'
              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
          )}>
            {item.suggestedConfidence === 'HIGH' ? 'exact' : 'approx'}
          </span>

          {/* Type badge */}
          <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-px text-[10px] text-muted-foreground">
            {suggestedType}
          </span>

          {/* Open link */}
          {suggestedType === 'set' && item.suggestedSetId && (
            <Link
              href={`/sets/${item.suggestedSetId}`}
              target="_blank"
              title="Open set"
              className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors"
            >
              <ExternalLink size={11} />
            </Link>
          )}

          {/* Confirm */}
          <button
            type="button"
            disabled={pending}
            onClick={handleConfirmSuggestion}
            title="Confirm link"
            className="shrink-0 flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-500/25 transition-colors"
          >
            <Check size={11} /> Confirm
          </button>

          {/* Dismiss */}
          <button
            type="button"
            disabled={pending}
            onClick={handleRejectSuggestion}
            title="Dismiss suggestion"
            className="shrink-0 text-muted-foreground/40 hover:text-red-500 transition-colors"
          >
            <X size={11} />
          </button>
        </div>
      )}

      <ArchiveSetPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        folderId={item.id}
        initialQuery={item.parsedTitle ?? item.folderName}
      />
    </div>
  )
}
