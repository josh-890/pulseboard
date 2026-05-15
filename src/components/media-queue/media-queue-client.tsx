'use client'

import { useState, useEffect, useTransition, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Camera, Film, Layers, ImageIcon, StickyNote, ExternalLink,
  CheckCircle2, XCircle, Clock, AlertCircle, FolderSearch, X,
  ChevronDown, ChevronRight, ShoppingCart, Search, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MediaQueueItem, SearchFolderResult } from '@/lib/services/archive-service'
import type { ArchiveStatus } from '@/generated/prisma/client'
import {
  toggleMediaQueueAction,
  updateMediaPriorityAction,
  confirmArchiveFolderLinkAction,
  rejectArchiveSuggestionAction,
  updateQueueNoteAction,
  searchArchiveFoldersAction,
  rematchItemAction,
} from '@/lib/actions/archive-actions'

// ─── Constants ────────────────────────────────────────────────────────────────

type StatusConfig = {
  label: string
  icon: React.ReactNode
  text: string
}

const ARCHIVE_STATUS_CONFIG: Record<ArchiveStatus, StatusConfig> = {
  UNKNOWN:    { label: 'No archive link',             icon: <XCircle size={12} className="shrink-0 text-red-400" />,      text: 'text-red-400' },
  PENDING:    { label: 'Path set — not scanned yet',  icon: <Clock size={12} className="shrink-0 text-blue-400" />,       text: 'text-blue-400' },
  OK:         { label: 'In archive',                  icon: <CheckCircle2 size={12} className="shrink-0 text-green-500" />, text: 'text-green-500' },
  CHANGED:    { label: 'In archive — count changed',  icon: <CheckCircle2 size={12} className="shrink-0 text-amber-500" />, text: 'text-amber-500' },
  MISSING:    { label: 'Missing from archive',        icon: <XCircle size={12} className="shrink-0 text-red-400" />,      text: 'text-red-400' },
  INCOMPLETE: { label: 'Video file missing',          icon: <AlertCircle size={12} className="shrink-0 text-orange-400" />, text: 'text-orange-400' },
}

const PRIORITY_CONFIG = {
  1: { label: 'P1', badge: 'bg-red-500 text-white hover:bg-red-400',        ring: 'border-red-500/40',    sectionBg: 'border-red-500/20',   dot: 'bg-red-500',   title: 'High' },
  2: { label: 'P2', badge: 'bg-amber-500 text-white hover:bg-amber-400',    ring: 'border-amber-500/40',  sectionBg: 'border-amber-500/20', dot: 'bg-amber-500', title: 'Medium' },
  3: { label: 'P3', badge: 'bg-slate-500/80 text-white hover:bg-slate-400', ring: 'border-slate-500/30',  sectionBg: 'border-slate-500/20', dot: 'bg-slate-400', title: 'Low' },
} as const

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterMode = 'all' | 'photo' | 'video'

// ─── Note Editor ──────────────────────────────────────────────────────────────

function NoteEditor({
  itemId,
  type,
  initialNote,
  onSaved,
}: {
  itemId: string
  type: MediaQueueItem['type']
  initialNote: string | null
  onSaved: (note: string | null) => void
}) {
  const [value, setValue] = useState(initialNote ?? '')
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  async function handleBlur() {
    const trimmed = value.trim() || null
    if (trimmed === (initialNote ?? null)) return
    setSaving(true)
    await updateQueueNoteAction(itemId, type, trimmed)
    onSaved(trimmed)
    setSaving(false)
  }

  return (
    <div className="pl-[calc(0.5rem+4px)] pr-1 pt-1.5">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder="Add a note…"
        rows={2}
        className={cn(
          'w-full resize-none rounded-lg border border-input bg-background/60 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50',
          'focus:outline-none focus:ring-1 focus:ring-primary/50',
          saving && 'opacity-60',
        )}
      />
    </div>
  )
}

// ─── Folder Search Panel ──────────────────────────────────────────────────────

function FolderSearchPanel({
  item,
  onLinked,
}: {
  item: MediaQueueItem
  onLinked: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchFolderResult[]>([])
  const [searching, setSearching] = useState(false)
  const [rematching, setRematching] = useState(false)
  const [rematchResult, setRematchResult] = useState<string | null>(null)
  const [linking, setLinking] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    const res = await searchArchiveFoldersAction(q, item.isVideo)
    setResults(res)
    setSearching(false)
  }, [item.isVideo])

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(q), 350)
  }

  async function handleRematch() {
    setRematching(true)
    setRematchResult(null)
    const res = await rematchItemAction(item.id, item.type)
    if (res.matched) {
      setRematchResult(`Match found (${res.confidence === 'HIGH' ? 'date+code' : 'title similarity'})`)
      onLinked()
    } else {
      setRematchResult('No match found')
    }
    setRematching(false)
  }

  async function handleLink(folderId: string) {
    setLinking(folderId)
    await confirmArchiveFolderLinkAction(folderId, item.id, item.type)
    onLinked()
    setLinking(null)
  }

  return (
    <div className="border-t border-white/8 px-3 pb-3 pt-2 space-y-2">
      {/* Search input + Re-match button */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleQueryChange}
            placeholder="Search archive folders…"
            className={cn(
              'w-full rounded-lg border border-input bg-background/60 py-1.5 pl-7 pr-2.5 text-xs text-foreground',
              'placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50',
            )}
          />
        </div>
        <button
          type="button"
          onClick={handleRematch}
          disabled={rematching}
          title="Re-run automatic matching for this item"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-muted/40 px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw size={11} className={cn(rematching && 'animate-spin')} />
          Re-match
        </button>
      </div>

      {/* Re-match result */}
      {rematchResult && (
        <p className={cn(
          'text-[11px]',
          rematchResult.startsWith('Match') ? 'text-green-500' : 'text-muted-foreground/60',
        )}>
          {rematchResult}
        </p>
      )}

      {/* Search results */}
      {searching && <p className="text-[11px] text-muted-foreground/50">Searching…</p>}
      {!searching && results.length === 0 && query.trim() && (
        <p className="text-[11px] text-muted-foreground/50">No folders found</p>
      )}
      {results.length > 0 && (
        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
          {results.map((folder) => (
            <div
              key={folder.id}
              className="flex items-center gap-2 rounded-lg border border-white/8 bg-muted/20 px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[11px] text-foreground/80" title={folder.fullPath}>
                  {folder.fullPath}
                </p>
                {folder.fileCount != null && (
                  <p className="text-[10px] text-muted-foreground/60">{folder.fileCount} files</p>
                )}
              </div>
              <button
                type="button"
                disabled={linking === folder.id}
                onClick={() => handleLink(folder.id)}
                className="shrink-0 flex items-center gap-1 rounded bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-600 transition-colors hover:bg-green-500/30 dark:text-green-400 disabled:opacity-50"
              >
                <CheckCircle2 size={10} />
                Link
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Queue Row ────────────────────────────────────────────────────────────────

function QueueRow({
  item,
  onRemove,
  onPriorityChange,
  onNoteChange,
}: {
  item: MediaQueueItem
  onRemove: (id: string, type: MediaQueueItem['type']) => void
  onPriorityChange: (id: string, type: MediaQueueItem['type'], priority: number) => void
  onNoteChange: (id: string, note: string | null) => void
}) {
  const [pending, startTransition] = useTransition()
  const [noteOpen, setNoteOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const router = useRouter()

  const dateStr = item.releaseDate
    ? new Date(item.releaseDate).toISOString().split('T')[0]
    : '????-??-??'

  const key = `${dateStr}-${item.channelShortName ?? item.channelName ?? '?'}`

  const hasPendingSuggestion =
    item.archiveSuggestion !== null &&
    (item.archiveStatus === 'UNKNOWN' || item.archiveStatus === 'MISSING')

  const prio = PRIORITY_CONFIG[item.mediaPriority as 1 | 2 | 3] ?? PRIORITY_CONFIG[3]

  const href = item.type === 'staging'
    ? `/staging-sets?selected=${item.id}`
    : `/sets/${item.id}`

  function cyclePriority() {
    const next = item.mediaPriority >= 3 ? 1 : item.mediaPriority + 1
    startTransition(() => onPriorityChange(item.id, item.type, next))
  }

  function handleConfirm() {
    startTransition(async () => {
      await confirmArchiveFolderLinkAction(item.archiveSuggestion!.folderId, item.id, item.type)
      router.refresh()
    })
  }

  function handleReject() {
    startTransition(async () => {
      await rejectArchiveSuggestionAction(item.archiveSuggestion!.folderId)
      router.refresh()
    })
  }

  const arcStatus = ARCHIVE_STATUS_CONFIG[item.archiveStatus]

  return (
    <div className={cn(
      'rounded-xl border bg-card/50 backdrop-blur-sm transition-all',
      pending && 'opacity-60',
      hasPendingSuggestion ? 'border-amber-500/30' : 'border-white/15 dark:border-white/10',
    )}>
      {/* ── Line 1: main info ── */}
      <div className="flex min-w-0 items-center gap-2 px-3 py-2.5">
        {/* Priority pill — click to cycle */}
        <button
          type="button"
          onClick={cyclePriority}
          disabled={pending}
          title={`Priority: ${prio.title} — click to change`}
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors',
            prio.badge,
          )}
        >
          {prio.label}
        </button>

        {/* Staging/Set badge */}
        <span className={cn(
          'shrink-0 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
          item.type === 'staging'
            ? 'bg-violet-500/20 text-violet-500 dark:text-violet-400'
            : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
        )}>
          {item.type === 'staging'
            ? <Layers size={10} />
            : <ImageIcon size={10} />}
          {item.type}
        </span>

        {/* Type icon */}
        <span className="shrink-0 text-muted-foreground/50">
          {item.isVideo ? <Film size={13} /> : <Camera size={13} />}
        </span>

        {/* KEY — date + channel shortname */}
        <span className="shrink-0 font-mono text-xs font-semibold text-foreground/80 tracking-tight">
          {key}
        </span>

        <span className="shrink-0 text-muted-foreground/40 text-xs">—</span>

        {/* Title */}
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={item.title}>
          {item.title}
        </span>

        {/* Right actions */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Search/link toggle */}
          <button
            type="button"
            onClick={() => setSearchOpen((o) => !o)}
            title="Search archive folders or re-run matching"
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded transition-colors',
              searchOpen
                ? 'text-primary bg-primary/10'
                : 'text-muted-foreground/30 hover:text-muted-foreground',
            )}
          >
            <Search size={13} />
          </button>

          {/* Note toggle */}
          <button
            type="button"
            onClick={() => setNoteOpen((o) => !o)}
            title={item.notes ? 'View/edit note' : 'Add note'}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded transition-colors',
              noteOpen
                ? 'text-primary bg-primary/10'
                : item.notes
                  ? 'text-amber-500 hover:text-amber-400'
                  : 'text-muted-foreground/30 hover:text-muted-foreground',
            )}
          >
            <StickyNote size={13} />
          </button>

          {/* Navigate */}
          <Link
            href={href}
            target={item.type === 'set' ? '_blank' : undefined}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground transition-colors"
            title="Open"
          >
            <ExternalLink size={13} />
          </Link>

          {/* Remove */}
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => onRemove(item.id, item.type))}
            title="Remove from shopping list"
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/30 hover:text-red-500 transition-colors disabled:opacity-50"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── Line 2: archive status / suggestion ── */}
      <div className="border-t border-white/8 px-3 py-2">
        {hasPendingSuggestion && item.archiveSuggestion ? (
          /* Suggestion pending */
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="flex items-center gap-1.5 shrink-0">
              <FolderSearch size={12} className="shrink-0 text-amber-500" />
              <span className="text-[10px] font-semibold text-amber-500">
                {item.archiveSuggestion.confidence === 'HIGH' ? 'date+code match' : 'title match'}
              </span>
            </div>

            {/* Full path — monospace, truncates from right, tooltip shows full */}
            <span
              className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground"
              title={item.archiveSuggestion.fullPath}
            >
              {item.archiveSuggestion.fullPath}
            </span>

            {item.archiveSuggestion.fileCount != null && (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                · {item.archiveSuggestion.fileCount} files
              </span>
            )}

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                disabled={pending}
                onClick={handleConfirm}
                className="flex items-center gap-1 rounded bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-600 transition-colors hover:bg-green-500/30 dark:text-green-400 disabled:opacity-50"
              >
                <CheckCircle2 size={10} />
                Confirm
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={handleReject}
                className="flex items-center gap-1 rounded bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-500/70 transition-colors hover:bg-red-500/20 hover:text-red-500 disabled:opacity-50"
              >
                <X size={10} />
                Reject
              </button>
            </div>
          </div>
        ) : (
          /* Confirmed status / no suggestion */
          <div className="flex items-center gap-2">
            {arcStatus.icon}
            <span className={cn('text-xs', arcStatus.text)}>{arcStatus.label}</span>

            {(item.archiveStatus === 'OK' || item.archiveStatus === 'CHANGED' || item.archiveStatus === 'INCOMPLETE') && (
              <>
                {item.archiveFileCount != null && (
                  <span className="text-xs text-muted-foreground">
                    · {item.archiveFileCount} {item.isVideo ? 'frames' : 'pics'}
                  </span>
                )}
                {item.isVideo && item.archiveVideoPresent !== null && (
                  <span className={cn('text-xs', item.archiveVideoPresent ? 'text-green-500' : 'text-red-400')}>
                    · video {item.archiveVideoPresent ? 'present' : 'missing'}
                  </span>
                )}
                {item.archivePath && (
                  <span
                    className="ml-1 min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground/60"
                    title={item.archivePath}
                  >
                    {item.archivePath}
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Line 3: note (only when open) ── */}
      {noteOpen && (
        <div className="border-t border-white/8 px-3 pb-2.5 pt-0">
          <NoteEditor
            itemId={item.id}
            type={item.type}
            initialNote={item.notes}
            onSaved={(note) => {
              onNoteChange(item.id, note)
            }}
          />
        </div>
      )}

      {/* ── Line 4: folder search panel (only when open) ── */}
      {searchOpen && (
        <FolderSearchPanel
          item={item}
          onLinked={() => {
            setSearchOpen(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

// ─── Priority Section ─────────────────────────────────────────────────────────

function PrioritySection({
  priority,
  items,
  onRemove,
  onPriorityChange,
  onNoteChange,
}: {
  priority: 1 | 2 | 3
  items: MediaQueueItem[]
  onRemove: (id: string, type: MediaQueueItem['type']) => void
  onPriorityChange: (id: string, type: MediaQueueItem['type'], priority: number) => void
  onNoteChange: (id: string, note: string | null) => void
}) {
  const [open, setOpen] = useState(priority < 3)
  const cfg = PRIORITY_CONFIG[priority]

  return (
    <div className={cn('rounded-2xl border shadow-md', cfg.sectionBg)}>
      {/* Section header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <span className={cn('h-2 w-2 rounded-full shrink-0', cfg.dot)} />
        <span className="font-semibold text-sm">
          {cfg.label} — {cfg.title}
        </span>
        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
          {items.length}
        </span>
        <span className="ml-auto text-muted-foreground/50">
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </span>
      </button>

      {open && items.length > 0 && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          {items.map((item) => (
            <QueueRow
              key={`${item.type}-${item.id}`}
              item={item}
              onRemove={onRemove}
              onPriorityChange={onPriorityChange}
              onNoteChange={onNoteChange}
            />
          ))}
        </div>
      )}

      {open && items.length === 0 && (
        <p className="px-4 pb-3 text-xs text-muted-foreground/50 italic">No items</p>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MediaQueueClient({ initialItems, total: initialTotal }: {
  initialItems: MediaQueueItem[]
  total: number
}) {
  const [items, setItems] = useState<MediaQueueItem[]>(initialItems)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')

  useEffect(() => { setItems(initialItems) }, [initialItems])

  const filtered = items.filter((item) => {
    if (filterMode === 'photo') return !item.isVideo
    if (filterMode === 'video') return item.isVideo
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (a.mediaPriority !== b.mediaPriority) return a.mediaPriority - b.mediaPriority
    const da = a.releaseDate?.getTime() ?? 0
    const db = b.releaseDate?.getTime() ?? 0
    return da - db
  })

  const groups = {
    p1: sorted.filter((i) => i.mediaPriority === 1),
    p2: sorted.filter((i) => i.mediaPriority === 2),
    p3: sorted.filter((i) => i.mediaPriority === 3),
  }

  function handleRemove(id: string, type: MediaQueueItem['type']) {
    setItems((prev) => prev.filter((item) => item.id !== id))
    toggleMediaQueueAction(id, type)
  }

  function handlePriorityChange(id: string, type: MediaQueueItem['type'], priority: number) {
    setItems((prev) =>
      prev.map((item) => item.id === id ? { ...item, mediaPriority: priority } : item),
    )
    updateMediaPriorityAction(id, type, priority)
  }

  function handleNoteChange(id: string, note: string | null) {
    setItems((prev) =>
      prev.map((item) => item.id === id ? { ...item, notes: note } : item),
    )
  }

  const counts = {
    all: items.length,
    photo: items.filter((i) => !i.isVideo).length,
    video: items.filter((i) => i.isVideo).length,
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShoppingCart size={20} className="text-muted-foreground" />
        <h1 className="text-2xl font-bold">Shopping List</h1>
        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
          {initialTotal} total
        </span>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
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

      {/* Empty state */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/20 bg-card/60 py-16 backdrop-blur-sm">
          <ShoppingCart size={32} className="opacity-20" />
          <p className="text-sm text-muted-foreground">Shopping list is empty</p>
          <p className="text-xs text-muted-foreground/60">
            Flag staging sets or promoted sets with the flag icon to add them here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <PrioritySection priority={1} items={groups.p1} onRemove={handleRemove} onPriorityChange={handlePriorityChange} onNoteChange={handleNoteChange} />
          <PrioritySection priority={2} items={groups.p2} onRemove={handleRemove} onPriorityChange={handlePriorityChange} onNoteChange={handleNoteChange} />
          <PrioritySection priority={3} items={groups.p3} onRemove={handleRemove} onPriorityChange={handlePriorityChange} onNoteChange={handleNoteChange} />
        </div>
      )}
    </div>
  )
}
