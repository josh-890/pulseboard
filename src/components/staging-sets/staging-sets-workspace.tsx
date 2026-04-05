'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ImageIcon,
  Film,
  Users,
  ArrowRight,
  Loader2,
  Check,
  X,
  Archive,
  Link2,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { StagingSetDetail } from './staging-set-detail'
import type { StagingSetWithRelations, StagingSetStats } from '@/lib/services/import/staging-set-service'
import type { StagingSetStatus } from '@/generated/prisma/client'

// ─── Constants ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Array<{ value: StagingSetStatus; label: string; dot: string }> = [
  { value: 'PENDING', label: 'Pending', dot: 'bg-blue-500' },
  { value: 'REVIEWING', label: 'Reviewing', dot: 'bg-yellow-500' },
  { value: 'APPROVED', label: 'Approved', dot: 'bg-cyan-500' },
  { value: 'PROMOTED', label: 'Promoted', dot: 'bg-emerald-500' },
  { value: 'INACTIVE', label: 'Inactive', dot: 'bg-gray-400' },
  { value: 'SKIPPED', label: 'Skipped', dot: 'bg-gray-400' },
]

const PRIORITY_LABELS: Record<number, string> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Urgent',
}

const PRIORITY_COLORS: Record<number, string> = {
  1: 'text-gray-400',
  2: 'text-blue-400',
  3: 'text-amber-400',
  4: 'text-red-400',
}

// ─── Types ─────────────────────────────────────────────────────────────────

type FetchResult = {
  items: StagingSetWithRelations[]
  total: number
  nextCursor: string | null
}

// ─── Component ─────────────────────────────────────────────────────────────

export function StagingSetsWorkspace() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ── Filter state from URL ──────────────────────────────────────────────
  const batchId = searchParams.get('batchId') || undefined
  const [statusFilter, setStatusFilter] = useState<StagingSetStatus[]>(
    () => {
      const param = searchParams.get('status')
      return param ? param.split(',') as StagingSetStatus[] : ['PENDING', 'REVIEWING', 'APPROVED']
    }
  )
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '')
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'priority' | 'importDate'>(
    (searchParams.get('sort') as 'date') || 'date'
  )

  // ���─ Data state ─────────────────────────────────────────────────────────
  const [data, setData] = useState<FetchResult | null>(null)
  const [stats, setStats] = useState<StagingSetStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isProcessing, setIsProcessing] = useState(false)

  // ── Fetch data ─────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    const params = new URLSearchParams()
    if (statusFilter.length) params.set('status', statusFilter.join(','))
    if (searchQuery) params.set('search', searchQuery)
    if (batchId) params.set('batchId', batchId)
    params.set('sort', sortBy)
    params.set('limit', '200')

    try {
      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/staging-sets?${params}`),
        fetch(`/api/staging-sets/stats${batchId ? `?batchId=${batchId}` : ''}`),
      ])
      const [listData, statsData] = await Promise.all([
        listRes.json() as Promise<FetchResult>,
        statsRes.json() as Promise<StagingSetStats>,
      ])
      setData(listData)
      setStats(statsData)
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, searchQuery, batchId, sortBy])

  useEffect(() => { fetchData() }, [fetchData])

  const selectedSet = useMemo(
    () => data?.items.find((s) => s.id === selectedId) ?? null,
    [data, selectedId],
  )

  // ── Actions ────────────────────────────────────────────────────────────

  const handleStatusChange = useCallback(async (id: string, status: StagingSetStatus) => {
    await fetch(`/api/staging-sets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchData()
  }, [fetchData])

  const handlePromote = useCallback(async (id: string) => {
    setIsProcessing(true)
    try {
      const res = await fetch(`/api/staging-sets/${id}/promote`, { method: 'POST' })
      const result = await res.json()
      if (!result.success) {
        alert(`Promote failed: ${result.error}`)
      }
      fetchData()
    } finally {
      setIsProcessing(false)
    }
  }, [fetchData])

  const handleFieldUpdate = useCallback(async (id: string, fields: Record<string, unknown>) => {
    await fetch(`/api/staging-sets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    fetchData()
  }, [fetchData])

  // ── Bulk actions ───────────────────────────────────────────────────────

  const handleBulkStatus = useCallback(async (status: StagingSetStatus) => {
    if (selectedIds.size === 0) return
    setIsProcessing(true)
    try {
      await fetch('/api/staging-sets/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), status }),
      })
      setSelectedIds(new Set())
      fetchData()
    } finally {
      setIsProcessing(false)
    }
  }, [selectedIds, fetchData])

  const handleBulkPromote = useCallback(async () => {
    if (selectedIds.size === 0) return
    setIsProcessing(true)
    try {
      const res = await fetch('/api/staging-sets/bulk-promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      const result = await res.json()
      if (result.failed?.length > 0) {
        alert(`${result.failed.length} failed to promote`)
      }
      setSelectedIds(new Set())
      fetchData()
    } finally {
      setIsProcessing(false)
    }
  }, [selectedIds, fetchData])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (!data) return
    setSelectedIds((prev) => {
      if (prev.size === data.items.length) return new Set()
      return new Set(data.items.map((s) => s.id))
    })
  }, [data])

  // ── Status filter toggle ───────────────────────────────────────────────

  const toggleStatusFilter = useCallback((status: StagingSetStatus) => {
    setStatusFilter((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    )
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Filter bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/50 px-4 py-2">
        {/* Status chips */}
        {STATUS_CONFIG.map(({ value, label, dot }) => {
          const isActive = statusFilter.includes(value)
          const count = stats?.byStatus[value] ?? 0
          return (
            <button
              key={value}
              onClick={() => toggleStatusFilter(value)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                isActive
                  ? 'border-border bg-muted text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted/50',
              )}
            >
              <span className={cn('inline-block h-1.5 w-1.5 rounded-full', dot)} />
              {label}
              {count > 0 && <span className="text-[10px] text-muted-foreground">{count}</span>}
            </button>
          )
        })}

        <div className="ml-auto flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search title, channel, artist..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-48 pl-8 text-xs"
            />
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="date">Sort: Date</option>
            <option value="title">Sort: Title</option>
            <option value="priority">Sort: Priority</option>
            <option value="importDate">Sort: Import Date</option>
          </select>
        </div>
      </div>

      {/* Progress bar */}
      {stats && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border/30 px-4 py-1.5 text-[10px] text-muted-foreground">
          <span>{data?.total ?? 0} items</span>
          {stats.byMatchType.exact > 0 && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-500" />
              {stats.byMatchType.exact} exact matches
            </span>
          )}
          {stats.byMatchType.probable > 0 && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
              {stats.byMatchType.probable} probable
            </span>
          )}
          {batchId && (
            <button
              onClick={() => router.push('/staging-sets')}
              className="ml-auto text-primary hover:underline"
            >
              Show all batches
            </button>
          )}
        </div>
      )}

      {/* Split panel */}
      <div className="flex min-h-0 flex-1">
        {/* Left: List */}
        <div className="w-80 shrink-0 overflow-y-auto border-r border-border/50 lg:w-96">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : data?.items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No staging sets match your filters
            </div>
          ) : (
            data?.items.map((ss) => {
              const isActive = selectedId === ss.id
              const isChecked = selectedIds.has(ss.id)
              const participants = (ss.participants as Array<{ name: string }>) ?? []
              const statusCfg = STATUS_CONFIG.find((c) => c.value === ss.status)

              return (
                <div
                  key={ss.id}
                  className={cn(
                    'flex items-center gap-2 border-b border-border/30 px-3 py-2.5 transition-colors hover:bg-muted/50',
                    isActive && 'bg-muted',
                  )}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSelect(ss.id)}
                    className="h-3.5 w-3.5 shrink-0 rounded border-border"
                  />

                  {/* Content */}
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setSelectedId(ss.id)}
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {ss.isVideo ? <Film size={10} /> : <ImageIcon size={10} />}
                      <span>{ss.releaseDate ? new Date(ss.releaseDate).toISOString().split('T')[0] : '????-??-??'}</span>
                      <span className="truncate">{ss.channelName}</span>
                      {participants.length > 1 && (
                        <span className="flex items-center gap-0.5">
                          <Users size={9} />
                          {participants.length}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm">{ss.title}</p>
                    {ss.matchedSetId && ss.status !== 'PROMOTED' && (
                      <p className="truncate text-[10px] text-purple-400">
                        {ss.matchConfidence === 1.0 ? 'Exact match' : `Match ${((ss.matchConfidence ?? 0) * 100).toFixed(0)}%`}
                      </p>
                    )}
                    {ss.duplicateGroupId && (
                      <p className="flex items-center gap-0.5 text-[10px] text-amber-500">
                        <Link2 size={9} /> Duplicate group
                      </p>
                    )}
                  </button>

                  {/* Status + priority */}
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className={cn('inline-block h-2 w-2 rounded-full', statusCfg?.dot ?? 'bg-gray-400')} />
                    {ss.priority && (
                      <span className={cn('text-[9px] font-medium', PRIORITY_COLORS[ss.priority])}>
                        {PRIORITY_LABELS[ss.priority]}
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Right: Detail */}
        <div className="flex-1 overflow-y-auto">
          {selectedSet ? (
            <StagingSetDetail
              stagingSet={selectedSet}
              onStatusChange={handleStatusChange}
              onPromote={handlePromote}
              onFieldUpdate={handleFieldUpdate}
              isProcessing={isProcessing}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <div className="text-center">
                <ArrowRight size={24} className="mx-auto mb-2 opacity-30" />
                Select a staging set to view details
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex shrink-0 items-center gap-3 border-t border-border/50 bg-muted/50 px-4 py-2">
          <button
            onClick={toggleSelectAll}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {selectedIds.size === data?.items.length ? 'Deselect all' : 'Select all'}
          </button>
          <span className="text-xs font-medium">{selectedIds.size} selected</span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus('APPROVED')} disabled={isProcessing}>
              <Check size={14} />
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus('INACTIVE')} disabled={isProcessing}>
              <Archive size={14} />
              Inactive
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus('SKIPPED')} disabled={isProcessing}>
              <X size={14} />
              Skip
            </Button>
            <Button size="sm" onClick={handleBulkPromote} disabled={isProcessing}>
              {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Promote
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
