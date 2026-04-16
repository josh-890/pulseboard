'use client'

import { memo, useState, useRef, useCallback, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { AlertTriangle, Camera, CheckSquare, Copy, Film, Flag, FolderOpen, FolderSearch, Check, X } from 'lucide-react'
import { cn, getInitialsFromName } from '@/lib/utils'
import type { StagingSetWithRelations, ParticipantStatus } from '@/lib/services/import/staging-set-service'
import type { StagingSetStatus } from '@/generated/prisma/client'
import { confirmArchiveFolderLinkAction, rejectArchiveSuggestionAction } from '@/lib/actions/archive-actions'
import { ArchiveFolderPicker } from './archive-folder-picker'

// ─── Constants ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<StagingSetStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-blue-500/15 text-blue-500' },
  REVIEWING: { label: 'Reviewing', className: 'bg-yellow-500/15 text-yellow-500' },
  APPROVED: { label: 'Approved', className: 'bg-cyan-500/15 text-cyan-500' },
  PROMOTED: { label: 'Promoted', className: 'bg-green-500 text-white font-semibold' },
  INACTIVE: { label: 'Inactive', className: 'bg-gray-400/15 text-gray-600 dark:text-gray-400' },
  SKIPPED: { label: 'Skipped', className: 'bg-gray-400/15 text-gray-600 dark:text-gray-400' },
}

const STATUS_TINT: Record<StagingSetStatus, string> = {
  PENDING: '',
  REVIEWING: 'bg-yellow-500/[0.04]',
  APPROVED: 'bg-emerald-500/[0.06]',
  PROMOTED: 'bg-green-500/[0.22]',
  INACTIVE: 'opacity-50',
  SKIPPED: 'opacity-40',
}

const STATUS_HOVER_TINT: Record<StagingSetStatus, string> = {
  PENDING: 'hover:bg-slate-100/80 dark:hover:bg-card/90',
  REVIEWING: 'hover:bg-yellow-500/[0.08]',
  APPROVED: 'hover:bg-emerald-500/[0.10]',
  PROMOTED: 'hover:bg-green-500/[0.30]',
  INACTIVE: '',
  SKIPPED: '',
}

const PRIORITY_DOT: Record<number, string> = {
  1: 'bg-gray-400',
  2: 'bg-blue-400',
  3: 'bg-amber-400',
  4: 'bg-red-400',
}

const PRIORITY_BORDER: Record<number, string> = {
  1: 'border-l-gray-400',
  2: 'border-l-blue-400',
  3: 'border-l-amber-400',
  4: 'border-l-red-400',
}

const STATUS_BORDER: Record<ParticipantStatus['status'], string> = {
  known: 'border-emerald-500',
  candidate: 'border-amber-500',
  new: 'border-red-500',
}

function participantTooltip(p: ParticipantStatus): string {
  if (p.status === 'known') return `${p.name} (${p.icgId}) \u2713 Known`
  if (p.status === 'candidate') return `${p.name} (${p.icgId}) ? Possible match`
  return `${p.name} (${p.icgId}) \u2014 New`
}

// ─── Types ─────────────────────────────────────────────────────────────────

const MEDIA_PRIORITY_LABEL: Record<number, string> = { 1: 'P1', 2: 'P2', 3: 'P3' }
const MEDIA_PRIORITY_CLASS: Record<number, string> = {
  1: 'bg-red-500/90 text-white',
  2: 'bg-amber-500/90 text-white',
  3: 'bg-slate-500/70 text-white',
}

type StagingSetRowProps = {
  stagingSet: StagingSetWithRelations
  isSelected: boolean
  isFocused: boolean
  isMultiSelectMode: boolean
  isChecked: boolean
  onSelect: (id: string) => void
  onToggleCheck: (id: string) => void
  onQueueToggle?: (id: string) => void
}

// ─── Cover Thumbnail with hover preview ───────────────────────────────────

function CoverThumbnail({
  coverImageUrl,
  title,
  isVideo,
  imgError,
  onImgError,
}: {
  coverImageUrl: string | null
  title: string
  isVideo: boolean
  imgError: boolean
  onImgError: () => void
}) {
  const thumbRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const showPreview = useCallback(() => {
    if (!thumbRef.current || !coverImageUrl) return
    const rect = thumbRef.current.getBoundingClientRect()
    // Clamp top so preview doesn't overflow below viewport (max preview height ~400px)
    const maxTop = window.innerHeight - 420
    setPos({ top: Math.min(rect.top, Math.max(8, maxTop)), left: rect.right + 8 })
    setHover(true)
  }, [coverImageUrl])

  const hidePreview = useCallback(() => setHover(false), [])

  return (
    <div
      ref={thumbRef}
      className="relative h-[80px] w-[56px] shrink-0 overflow-hidden rounded-lg bg-muted/30"
      onMouseEnter={showPreview}
      onMouseLeave={hidePreview}
    >
      {coverImageUrl && !imgError ? (
        <>
          <Image
            src={coverImageUrl}
            alt={title}
            fill
            className="object-contain"
            unoptimized
            sizes="56px"
            onError={onImgError}
          />
          {hover && pos && createPortal(
            <div
              className="pointer-events-none fixed z-[100] overflow-hidden rounded-lg border border-border bg-background shadow-xl"
              style={{ top: pos.top, left: pos.left }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverImageUrl}
                alt={title}
                className="block max-h-[400px] max-w-[300px]"
              />
            </div>,
            document.body,
          )}
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground/20">
          {isVideo ? <Film size={20} /> : <Camera size={20} />}
        </div>
      )}
    </div>
  )
}

// ─── Participant Avatar ────────────────────────────────────────────────────

function ParticipantAvatar({ p }: { p: ParticipantStatus }) {
  const [imgError, setImgError] = useState(false)
  return (
    <div
      className={cn(
        'relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 bg-muted text-sm font-medium text-muted-foreground',
        STATUS_BORDER[p.status],
      )}
    >
      {p.thumbnailUrl && !imgError ? (
        <Image
          src={p.thumbnailUrl}
          alt={p.name}
          fill
          className="object-cover"
          unoptimized
          sizes="48px"
          onError={() => setImgError(true)}
        />
      ) : (
        getInitialsFromName(p.name)
      )}
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Pure helper — mirrors archive-service.buildFolderName without DB imports */
function buildFolderName(
  dateStr: string,
  shortName: string,
  firstParticipantName: string | null,
  title: string,
): string {
  const participant = firstParticipantName ?? 'Unknown'
  return `${dateStr}-${shortName} ${participant} - ${title}`
}

// ─── Component ─────────────────────────────────────────────────────────────

export const StagingSetRow = memo(function StagingSetRow({
  stagingSet: ss,
  isSelected,
  isFocused,
  isMultiSelectMode,
  isChecked,
  onSelect,
  onToggleCheck,
  onQueueToggle,
}: StagingSetRowProps) {
  const [imgError, setImgError] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [isConfirming, startConfirm] = useTransition()
  const [isRejecting, startReject] = useTransition()
  const statuses = (ss.participantStatuses as ParticipantStatus[] | null) ?? []
  const dateStr = ss.releaseDate
    ? new Date(ss.releaseDate).toISOString().split('T')[0]
    : '????-??-??'
  const hasMatch = ss.matchedSetId && ss.status !== 'PROMOTED'
  const matchLabel = hasMatch
    ? ss.matchConfidence === 1.0
      ? 'Exact'
      : `${((ss.matchConfidence ?? 0) * 100).toFixed(0)}%`
    : null
  const badge = STATUS_BADGE[ss.status]
  // duplicateGroupId != null means this entry is part of a known duplicate group.
  // isDuplicate=true (without duplicateGroupId) means probable match by channel+date.
  const isDupExact = !!ss.duplicateGroupId
  const isDupProbable = ss.isDuplicate && !ss.duplicateGroupId

  // Archive state derivation
  const confirmedFolder = ss.coherenceSnapshot?.archiveFolder ?? null
  const suggestion = ss.suggestedArchiveFolder ?? null
  const hasArchiveLink = !!confirmedFolder

  // Expected path for the "no match" state (relative, no root prefix)
  const expectedFolderName = ss.releaseDate && ss.channel?.shortName
    ? buildFolderName(
        new Date(ss.releaseDate).toISOString().split('T')[0],
        ss.channel.shortName,
        statuses[0]?.name ?? null,
        ss.title,
      )
    : null
  const expectedRelativePath = expectedFolderName && ss.channel?.channelFolder
    ? `${ss.channel.channelFolder}\\${new Date(ss.releaseDate!).getFullYear()}\\${expectedFolderName}`
    : expectedFolderName

  // Picker seed: "{shortName} {year}"
  const pickerInitialQuery = [
    ss.channel?.shortName,
    ss.releaseDate ? new Date(ss.releaseDate).getFullYear().toString() : '',
  ].filter(Boolean).join(' ')

  // Build line 3 segments (no participant names — those are in the avatar stack)
  const line3Parts: string[] = []
  if (ss.artist) line3Parts.push(ss.artist)
  if (ss.imageCount) line3Parts.push(`${ss.imageCount} images`)

  // Avatar stack: max 3 visible + overflow
  const MAX_VISIBLE = 3
  const visibleAvatars = statuses.slice(0, MAX_VISIBLE)
  const overflowCount = statuses.length - MAX_VISIBLE

  return (
    <div className="relative flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
      {/* Checkbox */}
      {isMultiSelectMode && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleCheck(ss.id) }}
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors',
            isChecked
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-muted-foreground/40 bg-muted/30',
          )}
        >
          {isChecked && <CheckSquare className="h-3.5 w-3.5" />}
        </button>
      )}
      {/* Queue flag button */}
      {onQueueToggle && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onQueueToggle(ss.id) }}
          title={ss.mediaQueueAt ? 'Remove from media queue' : 'Add to media queue'}
          className={cn(
            'flex shrink-0 flex-col items-center gap-0.5 transition-colors',
            ss.mediaQueueAt
              ? 'text-violet-500 hover:text-violet-600 dark:text-violet-400'
              : 'text-muted-foreground/30 hover:text-muted-foreground/70',
          )}
        >
          <Flag size={14} className={ss.mediaQueueAt ? 'fill-current' : ''} />
          {ss.mediaPriority && MEDIA_PRIORITY_LABEL[ss.mediaPriority] && (
            <span className={cn('rounded px-0.5 text-[8px] font-bold leading-tight', MEDIA_PRIORITY_CLASS[ss.mediaPriority])}>
              {MEDIA_PRIORITY_LABEL[ss.mediaPriority]}
            </span>
          )}
        </button>
      )}

      {/* Row button */}
      <button
        type="button"
        onClick={() => onSelect(ss.id)}
        className={cn(
          'group flex w-full items-center gap-3 overflow-hidden rounded-xl border px-3 py-2 shadow-sm backdrop-blur-sm',
          'text-left transition-all duration-150',
          'active:scale-[0.995]',
          'border-l-4',
          isDupExact
            ? 'border-orange-500 bg-orange-500/[0.10] hover:bg-orange-500/[0.18] dark:bg-orange-500/[0.12] dark:hover:bg-orange-500/[0.20]'
            : isDupProbable
            ? 'border-amber-500 bg-amber-500/[0.08] hover:bg-amber-500/[0.14] dark:bg-amber-500/[0.10] dark:hover:bg-amber-500/[0.18]'
            : cn(
                'border-slate-200 bg-white/70 dark:border-border/40 dark:bg-card/70',
                'hover:border-slate-400 hover:shadow-md dark:hover:border-border/70',
                hasMatch
                  ? 'border-l-purple-500'
                  : hasArchiveLink
                  ? 'border-l-green-500'
                  : suggestion
                  ? (suggestion.confidence === 'HIGH' ? 'border-l-amber-500' : 'border-l-amber-400/60')
                  : ss.priority ? PRIORITY_BORDER[ss.priority] ?? 'border-l-transparent' : 'border-l-transparent',
                STATUS_TINT[ss.status],
                hasMatch ? 'bg-purple-500/[0.06] hover:bg-purple-500/[0.12]' : STATUS_HOVER_TINT[ss.status],
              ),
          isSelected && 'ring-2 ring-primary',
          isFocused && !isSelected && 'ring-2 ring-ring',
          isMultiSelectMode && isChecked && 'ring-2 ring-primary',
        )}
      >
        {/* Cover thumbnail */}
        <CoverThumbnail
          coverImageUrl={ss.coverImageUrl}
          title={ss.title}
          isVideo={ss.isVideo}
          imgError={imgError}
          onImgError={() => setImgError(true)}
        />

        {/* Info section */}
        <div className="flex min-w-0 flex-col gap-0.5">
          {/* Line 1: date · channel + dup icon */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0">{dateStr}</span>
            <span className="opacity-50">·</span>
            <span
              className={cn(
                'truncate',
                !ss.channelId && 'text-amber-500',
              )}
            >
              {ss.channelName}
            </span>
            {ss.isVideo && (
              <span className="shrink-0 text-violet-400" title="Video">
                <Film size={11} />
              </span>
            )}
          </div>

          {/* Line 2: title */}
          <p className="truncate text-sm font-medium">{ss.title}</p>

          {/* Line 3: participants · artist · image count */}
          <div className="truncate text-xs text-muted-foreground">
            {line3Parts.length > 0
              ? line3Parts.join(' · ')
              : '\u00A0'}
          </div>
        </div>

        {/* Avatar stack */}
        {statuses.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            {visibleAvatars.map((p) => (
              <div
                key={p.icgId}
                title={participantTooltip(p)}
                className="flex flex-col items-center gap-0.5"
              >
                <ParticipantAvatar p={p} />
                <span className="max-w-14 truncate text-[10px] text-muted-foreground">
                  {p.name}
                </span>
              </div>
            ))}
            {overflowCount > 0 && (
              <div
                className="flex flex-col items-center gap-0.5"
                title={statuses.slice(MAX_VISIBLE).map((p) => p.name).join(', ')}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-muted-foreground/40 bg-muted text-sm font-medium text-muted-foreground">
                  +{overflowCount}
                </div>
                <span className="text-[10px] text-muted-foreground">more</span>
              </div>
            )}
          </div>
        )}

        <span className="flex-1" />

        {/* Right section: badges */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Duplicate badges */}
          {isDupExact && (
            <span className="inline-flex items-center gap-1 rounded-md border border-orange-500/60 bg-orange-500/25 px-2 py-0.5 text-xs font-bold tracking-wide text-orange-500 dark:text-orange-400">
              <Copy size={10} />
              DUPLICATE
            </span>
          )}
          {isDupProbable && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold tracking-wide text-amber-600 dark:text-amber-400">
              <AlertTriangle size={10} />
              POSSIBLE DUP
            </span>
          )}

          {/* Match badge */}
          {matchLabel && (
            <span className="rounded-full bg-purple-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {matchLabel}
            </span>
          )}

          {/* Archive status dot — confirmed only; suggestion/no-match handled below the row */}
          {hasArchiveLink && (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-green-500"
              title={`Archive: ${confirmedFolder!.folderName}`}
            />
          )}
          {!hasArchiveLink && suggestion && (
            <span
              className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                suggestion.confidence === 'HIGH' ? 'bg-amber-500' : 'bg-amber-400/60',
              )}
              title={`Archive suggestion: ${suggestion.folderName}`}
            />
          )}

          {/* Status badge */}
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', badge.className)}>
            {badge.label}
          </span>

          {/* Priority dot */}
          {ss.priority && PRIORITY_DOT[ss.priority] && (
            <span
              className={cn('h-2 w-2 shrink-0 rounded-full', PRIORITY_DOT[ss.priority])}
              title={`Priority ${ss.priority}`}
            />
          )}
        </div>
      </button>
      </div>{/* end flex items-center */}

      {/* ── Archive section ──────────────────────────────────────────────── */}
      {/* Confirmed link */}
      {hasArchiveLink && (
        <div className="flex items-center gap-1.5 pl-3 text-xs text-green-600 dark:text-green-400">
          <FolderOpen size={11} className="shrink-0" />
          <span className="truncate font-medium">{confirmedFolder!.folderName}</span>
          {ss.coherenceSnapshot?.archiveFileCount != null && (
            <span className="shrink-0 text-muted-foreground">
              · {ss.coherenceSnapshot.archiveFileCount} files
            </span>
          )}
        </div>
      )}

      {/* Archive suggestion (HIGH or MEDIUM) */}
      {!hasArchiveLink && suggestion && (
        <div className="flex items-center gap-1.5 pl-3">
          <span
            className={cn(
              'shrink-0 text-xs font-medium',
              suggestion.confidence === 'HIGH' ? 'text-amber-600 dark:text-amber-400' : 'text-amber-500/70 dark:text-amber-400/60',
            )}
          >
            {suggestion.confidence === 'HIGH' ? '✓ date+code' : '~ title match'}
          </span>
          <FolderSearch
            size={11}
            className={cn(
              'shrink-0',
              suggestion.confidence === 'HIGH' ? 'text-amber-500' : 'text-amber-400/60',
            )}
          />
          <span
            className={cn(
              'min-w-0 truncate text-xs',
              suggestion.confidence === 'HIGH' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
            )}
          >
            {suggestion.folderName}
          </span>
          {suggestion.fileCount != null && (
            <span className="shrink-0 text-xs text-muted-foreground">
              · {suggestion.fileCount} files
            </span>
          )}
          <span className="flex-1" />
          <button
            type="button"
            disabled={isConfirming || isRejecting}
            onClick={(e) => {
              e.stopPropagation()
              startConfirm(async () => {
                await confirmArchiveFolderLinkAction(suggestion.folderId, ss.id, 'staging')
              })
            }}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
              'bg-green-500/15 text-green-700 hover:bg-green-500/30 dark:text-green-400',
              'disabled:pointer-events-none disabled:opacity-40',
            )}
          >
            <Check size={10} />
            Confirm
          </button>
          <button
            type="button"
            disabled={isConfirming || isRejecting}
            onClick={(e) => {
              e.stopPropagation()
              startReject(async () => {
                await rejectArchiveSuggestionAction(suggestion.folderId)
              })
            }}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
              'bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400',
              'disabled:pointer-events-none disabled:opacity-40',
            )}
          >
            <X size={10} />
          </button>
        </div>
      )}

      {/* No archive link and no suggestion */}
      {!hasArchiveLink && !suggestion && ss.status !== 'PROMOTED' && expectedFolderName && (
        <div className="flex items-center gap-1.5 pl-3">
          <span className="shrink-0 text-xs text-muted-foreground/50">○</span>
          {expectedRelativePath && (
            <span className="min-w-0 truncate text-xs text-muted-foreground/60" title={expectedRelativePath}>
              {expectedRelativePath}
            </span>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setPickerOpen(true)
            }}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
              'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <FolderSearch size={10} />
            Link folder
          </button>
        </div>
      )}

      {/* Archive folder picker sheet */}
      {pickerOpen && (
        <ArchiveFolderPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          stagingSetId={ss.id}
          initialQuery={pickerInitialQuery}
        />
      )}
    </div>
  )
})
