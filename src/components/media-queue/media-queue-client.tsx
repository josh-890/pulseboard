'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Camera, Film, Layers, ImageIcon, Flag, HardDrive, ExternalLink, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MediaQueueItem } from '@/lib/services/archive-service'
import type { ArchiveStatus } from '@/generated/prisma/client'
import { toggleMediaQueueAction, updateMediaPriorityAction } from '@/lib/actions/archive-actions'

// ─── Constants ────────────────────────────────────────────────────────────────

type StatusConfig = {
  label: string
  icon: React.ReactNode
  text: string
  rowBorder: string
  rowBg: string
}

const ARCHIVE_STATUS_CONFIG: Record<ArchiveStatus, StatusConfig> = {
  UNKNOWN:    {
    label: 'No archive path',
    icon: <XCircle size={14} className="shrink-0 text-red-500" />,
    text: 'text-red-500',
    rowBorder: 'border-red-500/30',
    rowBg: 'bg-red-500/5',
  },
  PENDING:    {
    label: 'Path set — not scanned yet',
    icon: <Clock size={14} className="shrink-0 text-blue-400" />,
    text: 'text-blue-500',
    rowBorder: 'border-blue-500/20',
    rowBg: 'bg-blue-500/5',
  },
  OK:         {
    label: 'In archive',
    icon: <CheckCircle2 size={14} className="shrink-0 text-green-500" />,
    text: 'text-green-500',
    rowBorder: 'border-green-500/30',
    rowBg: 'bg-green-500/6',
  },
  CHANGED:    {
    label: 'In archive — count changed',
    icon: <CheckCircle2 size={14} className="shrink-0 text-amber-500" />,
    text: 'text-amber-500',
    rowBorder: 'border-amber-500/30',
    rowBg: 'bg-amber-500/5',
  },
  MISSING:    {
    label: 'Missing from archive',
    icon: <XCircle size={14} className="shrink-0 text-red-500" />,
    text: 'text-red-500',
    rowBorder: 'border-red-500/30',
    rowBg: 'bg-red-500/5',
  },
  INCOMPLETE: {
    label: 'In archive — video file missing',
    icon: <AlertCircle size={14} className="shrink-0 text-orange-500" />,
    text: 'text-orange-500',
    rowBorder: 'border-orange-500/30',
    rowBg: 'bg-orange-500/5',
  },
}

const PRIORITY_CONFIG: Record<number, { label: string; badge: string; ring: string }> = {
  1: { label: 'P1', badge: 'bg-red-500/90 text-white',    ring: 'ring-red-500/40' },
  2: { label: 'P2', badge: 'bg-amber-500/90 text-white',  ring: 'ring-amber-500/40' },
  3: { label: 'P3', badge: 'bg-slate-500/70 text-white',  ring: 'ring-slate-500/30' },
}

// ─── Types ────────────────────────────────────────────────────────────────────

type MediaQueueClientProps = {
  initialItems: MediaQueueItem[]
  total: number
}

type FilterMode = 'all' | 'photo' | 'video'

// ─── Row ──────────────────────────────────────────────────────────────────────

function QueueRow({
  item,
  onRemove,
  onPriorityChange,
}: {
  item: MediaQueueItem
  onRemove: (id: string, type: MediaQueueItem['type']) => void
  onPriorityChange: (id: string, type: MediaQueueItem['type'], priority: number) => void
}) {
  const [pending, startTransition] = useTransition()
  const dateStr = item.releaseDate
    ? new Date(item.releaseDate).toISOString().split('T')[0]
    : '????-??-??'
  const arc = ARCHIVE_STATUS_CONFIG[item.archiveStatus]
  const prio = item.mediaPriority ? PRIORITY_CONFIG[item.mediaPriority] : null
  const href = item.type === 'staging'
    ? `/staging-sets?selected=${item.id}`
    : `/sets/${item.id}`

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm backdrop-blur-sm transition-all',
        arc.rowBorder,
        arc.rowBg,
        pending && 'opacity-60',
      )}
    >
      {/* Priority badge */}
      {prio && (
        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold', prio.badge)}>
          {prio.label}
        </span>
      )}

      {/* Type icon */}
      <span className="shrink-0 text-muted-foreground/60">
        {item.isVideo ? <Film size={14} /> : <Camera size={14} />}
      </span>

      {/* Staging/Set badge */}
      <span className={cn(
        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        item.type === 'staging'
          ? 'bg-violet-500/20 text-violet-600 dark:text-violet-400'
          : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
      )}>
        {item.type === 'staging' ? <Layers size={10} className="inline" /> : <ImageIcon size={10} className="inline" />}
        {' '}{item.type}
      </span>

      {/* Date · Channel */}
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{dateStr}</span>
      <span className="w-36 shrink-0 truncate text-xs text-muted-foreground">{item.channelName ?? '—'}</span>

      {/* Title */}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>

      {/* Archive status */}
      <span className="flex min-w-0 shrink-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          {arc.icon}
          <span className={cn('text-xs font-semibold', arc.text)}>{arc.label}</span>
        </span>
        {/* Detail line — file count / video presence */}
        {(item.archiveStatus === 'OK' || item.archiveStatus === 'CHANGED' || item.archiveStatus === 'INCOMPLETE') && (
          <span className="flex items-center gap-2 pl-5 text-[11px] text-muted-foreground">
            {item.archiveFileCount != null && (
              <span>{item.archiveFileCount} {item.isVideo ? 'frames' : 'pics'}</span>
            )}
            {item.isVideo && (
              <span className={item.archiveVideoPresent ? 'text-green-500' : 'text-red-500'}>
                · video {item.archiveVideoPresent ? 'present' : 'missing'}
              </span>
            )}
          </span>
        )}
      </span>

      {/* Priority selector */}
      <select
        value={item.mediaPriority ?? 2}
        disabled={pending}
        onChange={(e) => {
          const p = Number(e.target.value)
          startTransition(() => onPriorityChange(item.id, item.type, p))
        }}
        className="h-7 rounded border border-input bg-background px-1.5 text-xs"
        title="Media priority"
      >
        <option value={1}>P1 — High</option>
        <option value={2}>P2 — Medium</option>
        <option value={3}>P3 — Low</option>
      </select>

      {/* Navigate */}
      <Link
        href={href}
        target={item.type === 'set' ? '_blank' : undefined}
        className="shrink-0 text-muted-foreground/50 hover:text-foreground"
        title="Open"
      >
        <ExternalLink size={14} />
      </Link>

      {/* Remove from queue */}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => onRemove(item.id, item.type))}
        title="Remove from shopping list"
        className="shrink-0 text-muted-foreground/40 hover:text-red-500 transition-colors"
      >
        <Flag size={14} className="fill-current" />
      </button>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MediaQueueClient({ initialItems, total: initialTotal }: MediaQueueClientProps) {
  const [items, setItems] = useState<MediaQueueItem[]>(initialItems)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')

  const filtered = items.filter((item) => {
    if (filterMode === 'photo') return !item.isVideo
    if (filterMode === 'video') return item.isVideo
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const pa = a.mediaPriority ?? 99
    const pb = b.mediaPriority ?? 99
    if (pa !== pb) return pa - pb
    const da = a.releaseDate?.getTime() ?? 0
    const db = b.releaseDate?.getTime() ?? 0
    return da - db
  })

  const handleRemove = async (id: string, type: MediaQueueItem['type']) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
    await toggleMediaQueueAction(id, type)
  }

  const handlePriorityChange = async (id: string, type: MediaQueueItem['type'], priority: number) => {
    setItems((prev) =>
      prev.map((item) => item.id === id ? { ...item, mediaPriority: priority } : item),
    )
    await updateMediaPriorityAction(id, type, priority)
  }

  const counts = {
    all: items.length,
    photo: items.filter((i) => !i.isVideo).length,
    video: items.filter((i) => i.isVideo).length,
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <HardDrive size={20} className="text-muted-foreground" />
        <h1 className="text-2xl font-bold">Shopping List</h1>
        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
          {initialTotal} total
        </span>
      </div>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md dark:border-white/10">
        {/* Filter tabs */}
        <div className="mb-4 flex gap-2">
          {(['all', 'photo', 'video'] as FilterMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                filterMode === mode
                  ? 'border-primary/50 bg-primary/15 text-primary'
                  : 'border-border/50 bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground',
              )}
            >
              {mode === 'photo' && <Camera size={12} />}
              {mode === 'video' && <Film size={12} />}
              {mode === 'all' ? 'All' : mode === 'photo' ? 'Photos' : 'Videos'}
              <span className="text-[10px] opacity-70">{counts[mode]}</span>
            </button>
          ))}
        </div>

        {sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <Flag size={32} className="opacity-20" />
            <p className="text-sm">Shopping list is empty</p>
            <p className="text-xs opacity-60">
              Flag staging sets or promoted sets with the{' '}
              <Flag size={10} className="inline" /> icon to add them here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sorted.map((item) => (
              <QueueRow
                key={`${item.type}-${item.id}`}
                item={item}
                onRemove={handleRemove}
                onPriorityChange={handlePriorityChange}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
