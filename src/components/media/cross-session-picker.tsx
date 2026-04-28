'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Search, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GalleryItem } from '@/lib/types'

// ─── Types ──────────────────────────────────────────────────────────────────

type CrossSessionPickerProps = {
  personId: string
  onSelect: (item: GalleryItem) => void
  onClose: () => void
  title?: string
}

type FetchState = {
  items: GalleryItem[]
  nextCursor: string | null
  loading: boolean
  error: string | null
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
  const [state, setState] = useState<FetchState>({
    items: [],
    nextCursor: null,
    loading: true,
    error: null,
  })
  const loaderRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  // Initial load + search refresh
  const load = useCallback(async (cursor?: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const params = new URLSearchParams({ limit: '60' })
      if (cursor) params.set('cursor', cursor)
      if (debouncedSearch) params.set('search', debouncedSearch)

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
  }, [personId, debouncedSearch])

  useEffect(() => {
    setState({ items: [], nextCursor: null, loading: true, error: null })
    load()
  }, [load])

  // Infinite scroll
  useEffect(() => {
    const el = loaderRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && state.nextCursor && !state.loading) {
          load(state.nextCursor)
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [state.nextCursor, state.loading, load])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"
        >
          <X size={18} />
        </button>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <div className="relative ml-auto w-60">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search captions…"
            className="w-full rounded-md border border-white/10 bg-white/5 py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-zinc-500 focus:border-white/20 focus:outline-none"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {state.error ? (
          <p className="text-center text-sm text-red-400">{state.error}</p>
        ) : state.items.length === 0 && !state.loading ? (
          <p className="text-center text-sm text-zinc-500">No photos found.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
            {state.items.map((item) => (
              <PickerThumbnail key={item.id} item={item} onSelect={onSelect} />
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={loaderRef} className="flex justify-center py-4">
          {state.loading && <Loader2 size={18} className="animate-spin text-zinc-500" />}
        </div>
      </div>
    </div>
  )
}

// ─── Thumbnail ───────────────────────────────────────────────────────────────

function PickerThumbnail({
  item,
  onSelect,
}: {
  item: GalleryItem
  onSelect: (item: GalleryItem) => void
}) {
  const thumbUrl = item.urls.gallery_512 ?? item.urls.view_1200 ?? item.urls.original
  const isRef = !item.sessionName

  return (
    <button
      onClick={() => onSelect(item)}
      className="group relative aspect-square overflow-hidden rounded-lg bg-zinc-900 ring-2 ring-transparent transition hover:ring-indigo-500 focus:outline-none focus:ring-indigo-500"
    >
      {thumbUrl ? (
        <Image
          src={thumbUrl}
          alt={item.caption ?? item.filename}
          fill
          unoptimized
          className="object-cover transition group-hover:scale-105"
          sizes="160px"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-zinc-600">
          No preview
        </div>
      )}

      {/* Session badge */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1.5 pt-4">
        <span
          className={cn(
            'inline-block truncate rounded px-1 py-0.5 text-[10px] font-medium leading-none',
            isRef
              ? 'bg-indigo-500/80 text-white'
              : 'bg-black/60 text-zinc-300',
          )}
        >
          {isRef ? 'Reference' : item.sessionName}
        </span>
      </div>
    </button>
  )
}
