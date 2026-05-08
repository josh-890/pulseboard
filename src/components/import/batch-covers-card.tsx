'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, ImageIcon, Loader2 } from 'lucide-react'
import Link from 'next/link'
import type { CoverBasketWithItems } from '@/lib/services/import/cover-basket-service'

type BasketCounts = {
  pending: number
  matched: number
  transferred: number
}

type BatchCoversCardProps = {
  personId: string | null
  personName: string
}

function countBasket(basket: CoverBasketWithItems | null): BasketCounts {
  const items = basket?.items ?? []
  return {
    pending: items.filter((i) => i.status === 'PENDING').length,
    matched: items.filter((i) => i.status === 'MATCHED').length,
    transferred: items.filter((i) => i.status === 'TRANSFERRED').length,
  }
}

export function BatchCoversCard({ personId, personName }: BatchCoversCardProps) {
  const [photoCounts, setPhotoCounts] = useState<BasketCounts | null>(null)
  const [videoCounts, setVideoCounts] = useState<BasketCounts | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!personId) return
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const [photoRes, videoRes] = await Promise.all([
          fetch(`/api/cover-baskets?personId=${personId}&isVideo=false`),
          fetch(`/api/cover-baskets?personId=${personId}&isVideo=true`),
        ])
        if (cancelled) return
        const [photo, video] = await Promise.all([
          photoRes.ok ? (photoRes.json() as Promise<CoverBasketWithItems | null>) : Promise.resolve(null),
          videoRes.ok ? (videoRes.json() as Promise<CoverBasketWithItems | null>) : Promise.resolve(null),
        ])
        if (!cancelled) {
          setPhotoCounts(countBasket(photo))
          setVideoCounts(countBasket(video))
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [personId])

  const coversUrl = personId
    ? `/import/covers?personId=${personId}&personLabel=${encodeURIComponent(personName)}`
    : '/import/covers'

  return (
    <div className="mx-4 mb-4 mt-2 rounded-xl border border-border/50 bg-card/50 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <ImageIcon size={14} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">Cover Images</p>
            {!personId ? (
              <p className="text-xs text-muted-foreground">Import person first to manage covers</p>
            ) : isLoading ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 size={10} className="animate-spin" /> Loading…
              </span>
            ) : (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {photoCounts && (
                  <span>
                    Photo: {photoCounts.transferred} transferred
                    {photoCounts.matched > 0 && <span className="ml-1 text-amber-500">{photoCounts.matched} matched</span>}
                    {photoCounts.pending > 0 && <span className="ml-1">{photoCounts.pending} pending</span>}
                  </span>
                )}
                {videoCounts && (
                  <span>
                    Video: {videoCounts.transferred} transferred
                    {videoCounts.matched > 0 && <span className="ml-1 text-amber-500">{videoCounts.matched} matched</span>}
                    {videoCounts.pending > 0 && <span className="ml-1">{videoCounts.pending} pending</span>}
                  </span>
                )}
                {!photoCounts && !videoCounts && <span>No covers uploaded yet</span>}
              </div>
            )}
          </div>
        </div>

        <Link
          href={coversUrl}
          className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
        >
          Manage covers
          <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  )
}
