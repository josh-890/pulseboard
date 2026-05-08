'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { CoverBasketPanel } from './cover-basket-panel'
import type { CoverBasketWithItems } from '@/lib/services/import/cover-basket-service'

type CoverBasketsTabProps = {
  personId: string | undefined
  /** When set, shows a note linking to Import → Cover Baskets for bulk uploads */
  importLinkPersonLabel?: string
}

export function CoverBasketsTab({ personId, importLinkPersonLabel }: CoverBasketsTabProps) {
  const [photoBasket, setPhotoBasket] = useState<CoverBasketWithItems | null>(null)
  const [videoBasket, setVideoBasket] = useState<CoverBasketWithItems | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const fetchBaskets = useCallback(async () => {
    if (!personId) return
    setIsLoading(true)
    try {
      const [photoRes, videoRes] = await Promise.all([
        fetch(`/api/cover-baskets?personId=${personId}&isVideo=false`),
        fetch(`/api/cover-baskets?personId=${personId}&isVideo=true`),
      ])
      setPhotoBasket(photoRes.ok ? (await photoRes.json()) as CoverBasketWithItems | null : null)
      setVideoBasket(videoRes.ok ? (await videoRes.json()) as CoverBasketWithItems | null : null)
    } finally {
      setIsLoading(false)
    }
  }, [personId])

  useEffect(() => {
    fetchBaskets()
  }, [fetchBaskets])

  if (!personId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm font-medium">Select a person to view their cover baskets</p>
        <p className="text-xs text-muted-foreground">Use the person filter in the search bar above</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  const importUrl = personId
    ? `/import/covers?personId=${personId}${importLinkPersonLabel ? `&personLabel=${encodeURIComponent(importLinkPersonLabel)}` : ''}`
    : '/import/covers'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Import link note — only shown when accessed from Staging Sets */}
      {importLinkPersonLabel !== undefined && (
        <div className="flex items-center justify-end gap-1 border-b border-border/30 px-4 py-1.5 text-[11px] text-muted-foreground">
          Upload new cover batches in
          <Link href={importUrl} className="flex items-center gap-0.5 text-primary hover:underline">
            Import → Cover Baskets
            <ArrowRight size={10} />
          </Link>
        </div>
      )}
      <div className="flex min-h-0 flex-1 gap-4 p-4">
        <CoverBasketPanel
          personId={personId}
          isVideo={false}
          basket={photoBasket}
          onRefresh={fetchBaskets}
        />
        <CoverBasketPanel
          personId={personId}
          isVideo={true}
          basket={videoBasket}
          onRefresh={fetchBaskets}
        />
      </div>
    </div>
  )
}
