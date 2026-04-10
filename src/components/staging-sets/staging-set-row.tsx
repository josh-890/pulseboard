'use client'

import { memo, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { AlertTriangle, Camera, CheckSquare, Copy, Film } from 'lucide-react'
import { cn, getInitialsFromName } from '@/lib/utils'
import type { StagingSetWithRelations, ParticipantStatus } from '@/lib/services/import/staging-set-service'
import type { StagingSetStatus } from '@/generated/prisma/client'

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

type StagingSetRowProps = {
  stagingSet: StagingSetWithRelations
  isSelected: boolean
  isFocused: boolean
  isMultiSelectMode: boolean
  isChecked: boolean
  onSelect: (id: string) => void
  onToggleCheck: (id: string) => void
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

// ─── Component ─────────────────────────────────────────────────────────────

export const StagingSetRow = memo(function StagingSetRow({
  stagingSet: ss,
  isSelected,
  isFocused,
  isMultiSelectMode,
  isChecked,
  onSelect,
  onToggleCheck,
}: StagingSetRowProps) {
  const [imgError, setImgError] = useState(false)
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
  const isDup = isDupExact || isDupProbable

  // Build line 3 segments (no participant names — those are in the avatar stack)
  const line3Parts: string[] = []
  if (ss.artist) line3Parts.push(ss.artist)
  if (ss.imageCount) line3Parts.push(`${ss.imageCount} images`)

  // Avatar stack: max 3 visible + overflow
  const MAX_VISIBLE = 3
  const visibleAvatars = statuses.slice(0, MAX_VISIBLE)
  const overflowCount = statuses.length - MAX_VISIBLE

  return (
    <div className="relative flex items-center gap-2">
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
    </div>
  )
})
