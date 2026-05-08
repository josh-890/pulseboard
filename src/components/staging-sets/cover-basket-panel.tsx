'use client'

import { useCallback, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFileDrop } from '@/lib/hooks/use-file-drop'
import { Button } from '@/components/ui/button'
import { CoverBasketItemRow } from './cover-basket-item-row'
import type { CoverBasketWithItems, CoverBasketItemWithMatch } from '@/lib/services/import/cover-basket-service'

// ─── Types ──────────────────────────────────────────────────────────────────

type CoverBasketPanelProps = {
  personId: string
  isVideo: boolean
  basket: CoverBasketWithItems | null
  onRefresh: () => void
}

type UploadState = 'idle' | 'uploading' | 'done' | 'error'

// ─── Component ───────────────────────────────────────────────────────────────

export function CoverBasketPanel({ personId, isVideo, basket, onRefresh }: CoverBasketPanelProps) {
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadMessage, setUploadMessage] = useState('')
  const [showTransferred, setShowTransferred] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const label = isVideo ? 'Video' : 'Photo'

  // ── Stats ──────────────────────────────────────────────────────────────
  const items = basket?.items ?? []
  const pending = items.filter((i) => i.status === 'PENDING').length
  const matched = items.filter((i) => i.status === 'MATCHED').length
  const transferred = items.filter((i) => i.status === 'TRANSFERRED').length
  const ignored = items.filter((i) => i.status === 'IGNORED').length

  const visibleItems = items.filter((i) =>
    i.status === 'PENDING' || i.status === 'MATCHED' || (showTransferred && i.status === 'TRANSFERRED'),
  )

  // ── Upload ─────────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return

    // Get-or-create the basket first
    let basketId = basket?.id
    if (!basketId) {
      const res = await fetch('/api/cover-baskets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, isVideo }),
      })
      if (!res.ok) { setUploadMessage('Failed to create basket'); setUploadState('error'); return }
      const data = await res.json() as { id: string }
      basketId = data.id
    }

    setUploadState('uploading')
    setUploadMessage(`Uploading ${files.length} file${files.length !== 1 ? 's' : ''}…`)

    const formData = new FormData()
    for (const f of files) formData.append('files', f)

    try {
      const res = await fetch(`/api/cover-baskets/${basketId}/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json() as { added?: number; matched?: number; pending?: number; error?: string }

      if (!res.ok) {
        setUploadMessage(data.error ?? 'Upload failed')
        setUploadState('error')
      } else {
        setUploadMessage(`Added ${data.added} · ${data.matched} matched · ${data.pending} unmatched`)
        setUploadState('done')
        onRefresh()
      }
    } catch {
      setUploadMessage('Upload failed')
      setUploadState('error')
    }
  }, [basket?.id, personId, isVideo, onRefresh])

  const { dropProps, isDragOver } = useFileDrop((fileList) =>
    handleFiles(Array.from(fileList)),
  )

  // ── Transfer actions ───────────────────────────────────────────────────
  const handleTransfer = useCallback(async (itemId: string) => {
    const basketId = basket?.id
    if (!basketId) return
    const res = await fetch(`/api/cover-baskets/${basketId}/items/${itemId}/transfer`, { method: 'POST' })
    if (res.ok) onRefresh()
  }, [basket?.id, onRefresh])

  const handleIgnore = useCallback(async (itemId: string) => {
    const basketId = basket?.id
    if (!basketId) return
    await fetch(`/api/cover-baskets/${basketId}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'IGNORED' }),
    })
    onRefresh()
  }, [basket?.id, onRefresh])

  const handleAssign = useCallback(async (itemId: string, stagingSetId: string) => {
    const basketId = basket?.id
    if (!basketId) return
    await fetch(`/api/cover-baskets/${basketId}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'MATCHED', matchedSetId: stagingSetId }),
    })
    onRefresh()
  }, [basket?.id, onRefresh])

  const handleTransferAll = useCallback(async () => {
    const basketId = basket?.id
    if (!basketId) return
    const res = await fetch(`/api/cover-baskets/${basketId}/transfer-all`, { method: 'POST' })
    if (res.ok) onRefresh()
  }, [basket?.id, onRefresh])

  const handleReMatch = useCallback(async () => {
    const basketId = basket?.id
    if (!basketId) return
    const res = await fetch(`/api/cover-baskets/${basketId}/match`, { method: 'POST' })
    if (res.ok) onRefresh()
  }, [basket?.id, onRefresh])

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border/50 bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
        <h3 className="text-sm font-semibold">{label} Covers</h3>

        {/* Stat chips */}
        <div className="flex items-center gap-1.5">
          {pending > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {pending} pending
            </span>
          )}
          {matched > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              {matched} matched
            </span>
          )}
          {transferred > 0 && (
            <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
              {transferred} transferred
            </span>
          )}
          {ignored > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {ignored} ignored
            </span>
          )}
        </div>

        <span className="ml-auto" />

        {/* Re-match */}
        {basket && pending > 0 && (
          <button
            onClick={handleReMatch}
            title="Re-run matching"
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw size={13} />
          </button>
        )}

        {/* Transfer all matched */}
        {matched > 0 && (
          <Button size="sm" onClick={handleTransferAll}>
            Transfer all matched ({matched})
          </Button>
        )}
      </div>

      {/* Drop zone */}
      <div
        {...dropProps}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'mx-4 mt-4 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 transition-colors',
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-border/40 bg-muted/20 hover:border-border hover:bg-muted/30',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => { if (e.target.files) handleFiles(Array.from(e.target.files)) }}
        />
        {uploadState === 'uploading' ? (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            {uploadMessage}
          </span>
        ) : (
          <>
            <p className="text-xs font-medium">
              Drop {label.toLowerCase()} covers here or click to browse
            </p>
            <p className={cn('text-[11px]', uploadState === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
              {uploadState === 'done' || uploadState === 'error' ? uploadMessage : 'JPEG, PNG or WebP · matched by ExternalID in filename'}
            </p>
          </>
        )}
      </div>

      {/* Item list */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
        {visibleItems.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-8 text-xs text-muted-foreground">
            {items.length === 0 ? 'No cover images uploaded yet' : 'Nothing to review'}
          </div>
        ) : (
          visibleItems.map((item) => (
            <CoverBasketItemRow
              key={item.id}
              item={item as CoverBasketItemWithMatch}
              onTransfer={handleTransfer}
              onIgnore={handleIgnore}
              onAssign={handleAssign}
            />
          ))
        )}

        {transferred > 0 && (
          <button
            onClick={() => setShowTransferred((v) => !v)}
            className="mt-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {showTransferred ? `Hide transferred (${transferred})` : `Show transferred (${transferred})`}
          </button>
        )}
      </div>
    </div>
  )
}
