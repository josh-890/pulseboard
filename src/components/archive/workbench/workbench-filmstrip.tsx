'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export type StripItem = {
  id: string
  coverUrl: string | null
  identity: 'OPEN' | 'CONFIRMED' | 'REJECTED' | 'SKIPPED'
}

const STATE_RING: Record<StripItem['identity'], string> = {
  OPEN: 'ring-border/60',
  CONFIRMED: 'ring-emerald-500',
  REJECTED: 'ring-rose-500',
  SKIPPED: 'ring-muted-foreground/50',
}

/**
 * Position and state for the whole group, along the bottom.
 *
 * A one-at-a-time view is faster to decide in and loses your bearings; the
 * filmstrip is what gives them back. Microsoft's list-detail guidance calls this
 * out directly — drilling into detail should not cost you your place in the
 * whole — and it is the half of the Narrative Select / Lightroom Loupe anatomy
 * that is easy to leave out and immediately missed.
 *
 * Colour carries state so progress is legible without reading anything.
 */
export function WorkbenchFilmstrip({
  items,
  currentId,
  onJump,
}: {
  items: StripItem[]
  currentId: string | null
  onJump: (id: string) => void
}) {
  const stripRef = useRef<HTMLDivElement>(null)
  const currentRef = useRef<HTMLButtonElement>(null)

  // Keep the cursor centred rather than letting it walk to the edge and stop.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [currentId])

  if (items.length === 0) return null

  return (
    <div
      ref={stripRef}
      className="flex gap-1.5 overflow-x-auto border-t border-border/60 bg-card/60 px-3 py-2"
      role="tablist"
      aria-label="Folders in this group"
    >
      {items.map((it) => {
        const active = it.id === currentId
        return (
          <button
            key={it.id}
            ref={active ? currentRef : undefined}
            role="tab"
            aria-selected={active}
            onClick={() => onJump(it.id)}
            className={cn(
              'h-14 w-11 shrink-0 overflow-hidden rounded bg-muted ring-2 transition-transform duration-150',
              STATE_RING[it.identity],
              active ? 'scale-110 ring-primary' : 'opacity-70 hover:opacity-100',
            )}
          >
            {it.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- MinIO URL
              <img src={it.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <span className="block h-full w-full bg-muted" />
            )}
          </button>
        )
      })}
    </div>
  )
}
