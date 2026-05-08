'use client'

import { useState } from 'react'
import { Check, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CoverBasketItemWithMatch } from '@/lib/services/import/cover-basket-service'

// ─── Types ──────────────────────────────────────────────────────────────────

type CoverBasketItemRowProps = {
  item: CoverBasketItemWithMatch
  onTransfer: (itemId: string) => Promise<void>
  onIgnore: (itemId: string) => Promise<void>
  onAssign: (itemId: string, stagingSetId: string) => Promise<void>
}

// ─── Confidence badge ────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: 'high' | 'medium' | null }) {
  if (!confidence) return null
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        confidence === 'high'
          ? 'bg-green-500/15 text-green-600 dark:text-green-400'
          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
      )}
    >
      {confidence === 'high' ? 'High' : 'Medium'}
    </span>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CoverBasketItemRow({ item, onTransfer, onIgnore, onAssign }: CoverBasketItemRowProps) {
  const [isTransferring, setIsTransferring] = useState(false)
  const [isIgnoring, setIsIgnoring] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [assignQuery, setAssignQuery] = useState('')
  const [assignResults, setAssignResults] = useState<Array<{ id: string; title: string; externalId: string | null; channelName: string }>>([])
  const [isSearching, setIsSearching] = useState(false)

  const thumbnailUrl = item.thumbnailUrl
  const isTransferred = item.status === 'TRANSFERRED'
  const isIgnored = item.status === 'IGNORED'

  const handleTransfer = async () => {
    setIsTransferring(true)
    try { await onTransfer(item.id) } finally { setIsTransferring(false) }
  }

  const handleIgnore = async () => {
    setIsIgnoring(true)
    try { await onIgnore(item.id) } finally { setIsIgnoring(false) }
  }

  const handleAssignSearch = async (q: string) => {
    setAssignQuery(q)
    if (!q.trim()) { setAssignResults([]); return }
    setIsSearching(true)
    try {
      const res = await fetch(`/api/staging-sets?search=${encodeURIComponent(q)}&limit=8&status=PENDING,REVIEWING,APPROVED`)
      if (res.ok) {
        const data = await res.json() as { items: Array<{ id: string; title: string; externalId: string | null; channelName: string }> }
        setAssignResults(data.items)
      }
    } finally {
      setIsSearching(false)
    }
  }

  const handleAssignSelect = async (stagingSetId: string) => {
    setShowAssign(false)
    setAssignQuery('')
    setAssignResults([])
    await onAssign(item.id, stagingSetId)
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors',
        isTransferred
          ? 'border-green-500/20 bg-green-500/5 opacity-60'
          : isIgnored
          ? 'border-border/30 opacity-40'
          : 'border-border/50 bg-card',
      )}
    >
      {/* Thumbnail */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbnailUrl}
        alt={item.originalFilename}
        className="h-12 w-9 shrink-0 rounded object-cover"
      />

      {/* Filename */}
      <span className="w-48 shrink-0 truncate text-xs text-muted-foreground" title={item.originalFilename}>
        {item.originalFilename}
      </span>

      {/* Arrow */}
      <span className="shrink-0 text-muted-foreground/40">→</span>

      {/* Match info */}
      <div className="min-w-0 flex-1">
        {item.matchedSet ? (
          <div className="flex items-center gap-2">
            <span className="truncate text-xs font-medium">{item.matchedSet.title}</span>
            {item.matchedSet.externalId && (
              <span className="shrink-0 text-[10px] text-muted-foreground">#{item.matchedSet.externalId}</span>
            )}
            <ConfidenceBadge confidence={null} />
          </div>
        ) : (
          <div className="relative">
            {!showAssign ? (
              <button
                onClick={() => setShowAssign(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Search size={11} />
                No match — assign manually
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <div className="relative">
                  <input
                    autoFocus
                    value={assignQuery}
                    onChange={(e) => handleAssignSearch(e.target.value)}
                    placeholder="Search staging sets..."
                    className="h-6 w-48 rounded border border-input bg-background px-2 text-xs"
                  />
                  {assignResults.length > 0 && (
                    <div className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-md border border-border bg-popover shadow-md">
                      {assignResults.map((s) => (
                        <button
                          key={s.id}
                          onMouseDown={() => handleAssignSelect(s.id)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
                        >
                          <span className="font-medium truncate">{s.title}</span>
                          <span className="shrink-0 text-muted-foreground">{s.channelName}</span>
                          {s.externalId && <span className="shrink-0 text-muted-foreground">#{s.externalId}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {isSearching && <Loader2 size={10} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
                </div>
                <button onClick={() => { setShowAssign(false); setAssignQuery(''); setAssignResults([]) }}>
                  <X size={12} className="text-muted-foreground" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status / actions */}
      {isTransferred ? (
        <span className="flex items-center gap-1 text-[10px] text-green-500">
          <Check size={11} />
          Transferred
        </span>
      ) : isIgnored ? (
        <span className="text-[10px] text-muted-foreground">Ignored</span>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5">
          {item.matchedSet && (
            <button
              onClick={handleTransfer}
              disabled={isTransferring}
              className="flex items-center gap-1 rounded-md bg-green-500/15 px-2 py-1 text-[11px] font-medium text-green-600 transition-colors hover:bg-green-500/25 disabled:opacity-50 dark:text-green-400"
            >
              {isTransferring ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
              Transfer
            </button>
          )}
          <button
            onClick={handleIgnore}
            disabled={isIgnoring}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {isIgnoring ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
            Ignore
          </button>
        </div>
      )}
    </div>
  )
}
