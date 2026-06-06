'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GalleryItem } from '@/lib/types'
import { MediaPickerShell, type PickerItem } from '@/components/media/media-picker-shell'

// ─── Types ──────────────────────────────────────────────────────────────────

type CrossSessionPickerProps = {
  personId: string
  onSelect: (item: GalleryItem) => void
  onClose: () => void
  title?: string
}

type SessionSummary = {
  sessionId: string
  sessionName: string | null
  isReference: boolean
  mediaCount: number
}

type FetchState = {
  items: GalleryItem[]
  nextCursor: string | null
  loading: boolean
  error: string | null
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

function toPickerItem(item: GalleryItem, isReference: boolean): PickerItem {
  const u = item.urls
  return {
    id: item.id,
    thumbUrl: u.gallery_512 ?? u.view_1200 ?? u.original,
    previewUrl: u.full_2400 ?? u.view_1200 ?? u.gallery_512 ?? u.original,
    zoomUrl: u.master_4000 ?? u.full_2400 ?? null,
    focalX: item.focalX,
    focalY: item.focalY,
    caption: item.caption ?? item.filename,
    badgeLabel: isReference ? 'Reference' : (item.sessionName ?? 'Unknown'),
    badgeHighlight: isReference,
    width: item.originalWidth,
    height: item.originalHeight,
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CrossSessionPicker({
  personId,
  onSelect,
  onClose,
  title = 'Select photo',
}: CrossSessionPickerProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [state, setState] = useState<FetchState>({ items: [], nextCursor: null, loading: true, error: null })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load session list once on open
  useEffect(() => {
    fetch(`/api/media/person/${personId}?sessions=1`)
      .then((res) => res.json())
      .then((data: SessionSummary[]) => setSessions(data))
      .catch(() => {/* non-critical */})
  }, [personId])

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  // Load photos (initial + search + session filter refresh)
  const load = useCallback(async (cursor?: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const limit = selectedSessionId ? '500' : '60'
      const params = new URLSearchParams({ limit })
      if (cursor) params.set('cursor', cursor)
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (selectedSessionId) params.set('sessionId', selectedSessionId)

      const res = await fetch(`/api/media/person/${personId}?${params}`)
      if (!res.ok) throw new Error('Failed to load photos')
      const data: { items: GalleryItem[]; nextCursor: string | null } = await res.json()

      setState((prev) => ({
        items: cursor ? [...prev.items, ...data.items] : data.items,
        nextCursor: data.nextCursor,
        loading: false,
        error: null,
      }))
    } catch {
      setState((prev) => ({ ...prev, loading: false, error: 'Failed to load photos' }))
    }
  }, [personId, debouncedSearch, selectedSessionId])

  useEffect(() => {
    setState({ items: [], nextCursor: null, loading: true, error: null })
    load()
  }, [load])

  const handleSessionFilter = useCallback((sessionId: string | null) => {
    setSelectedSessionId(sessionId)
    setSearch('')
    setDebouncedSearch('')
  }, [])

  const refBySession = useMemo(
    () => new Map(sessions.map((s) => [s.sessionId, s.isReference])),
    [sessions],
  )

  const pickerItems = useMemo(
    () => state.items.map((it) => toPickerItem(it, refBySession.get(it.sessionId ?? '') ?? false)),
    [state.items, refBySession],
  )

  const handleConfirmOne = useCallback(
    (picked: PickerItem) => {
      const original = state.items.find((i) => i.id === picked.id)
      if (original) onSelect(original)
    },
    [state.items, onSelect],
  )

  const toolbar = (
    <div className="relative w-60">
      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search captions…"
        className="w-full rounded-md border border-white/10 bg-white/5 py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-zinc-500 focus:border-white/20 focus:outline-none"
      />
    </div>
  )

  const filterBar = sessions.length > 1 ? (
    <>
      <button
        onClick={() => handleSessionFilter(null)}
        className={cn(
          'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
          selectedSessionId === null ? 'bg-white/15 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white',
        )}
      >
        All sessions
      </button>
      {sessions.map((s) => (
        <button
          key={s.sessionId}
          onClick={() => handleSessionFilter(s.sessionId)}
          className={cn(
            'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
            selectedSessionId === s.sessionId
              ? s.isReference ? 'bg-indigo-500/80 text-white' : 'bg-white/15 text-white'
              : 'text-zinc-400 hover:bg-white/10 hover:text-white',
          )}
        >
          {s.isReference ? 'Reference' : (s.sessionName ?? 'Unnamed')}
          <span className="ml-1.5 text-zinc-500">{s.mediaCount}</span>
        </button>
      ))}
    </>
  ) : undefined

  return (
    <MediaPickerShell
      title={title}
      items={pickerItems}
      loading={state.loading}
      error={state.error}
      hasMore={!!state.nextCursor}
      onLoadMore={() => { if (state.nextCursor) load(state.nextCursor) }}
      onClose={onClose}
      selectionMode="single"
      onConfirmOne={handleConfirmOne}
      toolbar={toolbar}
      filterBar={filterBar}
    />
  )
}
