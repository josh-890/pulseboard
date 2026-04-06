'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Loader2,
  Check,
  X,
  Archive,
  CheckSquare,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StagingSetGrid } from './staging-set-grid'
import { StagingSetFilterBar, DEFAULT_FILTERS } from './staging-set-filter-bar'
import { StagingSetSlidePanel } from './staging-set-slide-panel'
import { useGridKeyboardNav } from '@/hooks/use-grid-keyboard-nav'
import type { StagingSetFilterState } from './staging-set-filter-bar'
import type { StagingSetWithRelations, StagingSetStats } from '@/lib/services/import/staging-set-service'
import type { StagingSetStatus } from '@/generated/prisma/client'
import {
  refreshParticipantStatusesAction,
  autoRefreshParticipantStatusesAction,
} from '@/lib/actions/staging-set-actions'

// ─── Types ─────────────────────────────────────────────────────────────────

type FetchResult = {
  items: StagingSetWithRelations[]
  total: number
  nextCursor: string | null
}

// ─── Component ─────────────────────────────────────────────────────────────

export function StagingSetsWorkspace() {
  const searchParams = useSearchParams()

  // ── Tab state ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'photo' | 'video'>(
    searchParams.get('type') === 'video' ? 'video' : 'photo',
  )

  // ── Filter state ──────────────────────────────────────────────────────
  const [filters, setFilters] = useState<StagingSetFilterState>(() => {
    const statusParam = searchParams.get('status')
    const batchId = searchParams.get('batchId') || undefined
    return {
      ...DEFAULT_FILTERS,
      status: statusParam
        ? (statusParam.split(',') as StagingSetStatus[])
        : DEFAULT_FILTERS.status,
      batchId,
      search: searchParams.get('search') || '',
      sort: (searchParams.get('sort') as StagingSetFilterState['sort']) || 'date',
      groupBy: (searchParams.get('groupBy') as StagingSetFilterState['groupBy']) || 'none',
    }
  })

  // ── Data state ────────────────────────────────────────────────────────
  const [data, setData] = useState<FetchResult | null>(null)
  const [stats, setStats] = useState<StagingSetStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const [isRefreshing, setIsRefreshing] = useState(false)

  // ── Selection state ───────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [isProcessing, setIsProcessing] = useState(false)

  const isPanelOpen = selectedId !== null
  const selectedSet = useMemo(
    () => data?.items.find((s) => s.id === selectedId) ?? null,
    [data, selectedId],
  )

  // ── Grid ref for keyboard nav ─────────────────────────────────────────
  const gridRef = useRef<HTMLDivElement | null>(null)
  const scrollToIndexRef = useRef<((index: number) => void) | null>(null)

  // ── Fetch data ────────────────────────────────────────────────────────
  const fetchData = useCallback(async (append?: boolean, _cursor?: string, offset?: number) => {
    if (!append) setIsLoading(true)
    else setIsLoadingMore(true)

    const params = new URLSearchParams()
    if (filters.status.length) params.set('status', filters.status.join(','))
    if (filters.search) params.set('search', filters.search)
    if (filters.batchId) params.set('batchId', filters.batchId)
    if (filters.noDate) params.set('noDate', 'true')
    if (filters.matchType === 'exact') params.set('matchType', 'exact')
    else if (filters.matchType === 'probable') params.set('matchType', 'probable')
    else if (filters.matchType === 'none') params.set('hasMatch', 'false')
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
    if (filters.dateTo) params.set('dateTo', filters.dateTo)
    if (filters.priority.length) params.set('priority', filters.priority.join(','))
    if (filters.channelId) params.set('channelId', filters.channelId)
    params.set('isVideo', activeTab === 'video' ? 'true' : 'false')
    params.set('sort', filters.sort)
    params.set('limit', '50')
    if (offset != null) params.set('offset', String(offset))

    try {
      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/staging-sets?${params}`),
        // Stats should reflect all items, not just current page
        !append ? fetch(`/api/staging-sets/stats${filters.batchId ? `?batchId=${filters.batchId}` : ''}`) : Promise.resolve(null),
      ])
      const listData = (await listRes.json()) as FetchResult

      if (append) {
        setData((prev) => prev ? {
          items: [...prev.items, ...listData.items],
          total: listData.total,
          nextCursor: listData.nextCursor,
        } : listData)
      } else {
        setData(listData)
      }

      if (statsRes) {
        const statsData = (await statsRes.json()) as StagingSetStats
        setStats(statsData)
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }, [filters, activeTab])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh participant statuses if >24hrs stale (runs once on mount)
  const autoRefreshRan = useRef(false)
  useEffect(() => {
    if (autoRefreshRan.current) return
    autoRefreshRan.current = true
    autoRefreshParticipantStatusesAction().then(({ updated }) => {
      if (updated > 0) fetchData(false)
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────────────────
  const handleStatusChange = useCallback(async (id: string, status: StagingSetStatus) => {
    // Optimistic update
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        items: prev.items.map((item) =>
          item.id === id ? { ...item, status } : item,
        ),
      }
    })
    try {
      await fetch(`/api/staging-sets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      fetchData()
    } catch {
      fetchData() // revert on error
    }
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

  // ── Bulk actions ──────────────────────────────────────────────────────
  const handleBulkStatus = useCallback(async (status: StagingSetStatus) => {
    if (checkedIds.size === 0) return
    setIsProcessing(true)
    try {
      await fetch('/api/staging-sets/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(checkedIds), status }),
      })
      setCheckedIds(new Set())
      setIsMultiSelectMode(false)
      fetchData()
    } finally {
      setIsProcessing(false)
    }
  }, [checkedIds, fetchData])

  const handleBulkPromote = useCallback(async () => {
    if (checkedIds.size === 0) return
    setIsProcessing(true)
    try {
      const res = await fetch('/api/staging-sets/bulk-promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(checkedIds) }),
      })
      const result = await res.json()
      if (result.failed?.length > 0) {
        alert(`${result.failed.length} failed to promote`)
      }
      setCheckedIds(new Set())
      setIsMultiSelectMode(false)
      fetchData()
    } finally {
      setIsProcessing(false)
    }
  }, [checkedIds, fetchData])

  const toggleCheck = useCallback((id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    if (!data) return
    setCheckedIds(new Set(data.items.map((s) => s.id)))
  }, [data])

  // ── Keyboard navigation ───────────────────────────────────────────────
  const visibleIds = useMemo(
    () => data?.items.map((i) => i.id) ?? [],
    [data],
  )

  const keyboardActions = useMemo(() => {
    const getId = () => visibleIds[keyNav.focusedIndex] ?? null
    return [
      {
        key: 'a',
        action: () => {
          const id = getId()
          if (id) handleStatusChange(id, 'APPROVED')
        },
      },
      {
        key: 's',
        action: () => {
          const id = getId()
          if (id) handleStatusChange(id, 'SKIPPED')
        },
      },
      {
        key: 'i',
        action: () => {
          const id = getId()
          if (id) handleStatusChange(id, 'INACTIVE')
        },
      },
      {
        key: 'p',
        action: () => {
          const id = getId()
          if (id) handlePromote(id)
        },
      },
    ]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds, handleStatusChange, handlePromote])

  const keyNav = useGridKeyboardNav({
    itemIds: visibleIds,
    gridRef,
    onFocusChange: () => {},
    enabled: !isMultiSelectMode,
    actions: keyboardActions,
    onEscape: () => setSelectedId(null),
    onOpen: (id) => setSelectedId(id),
    onToggle: (id) => toggleCheck(id),
    onScrollToIndex: (index) => scrollToIndexRef.current?.(index),
  })

  // ── Load more ─────────────────────────────────────────────────────────
  const handleLoadMore = useCallback(() => {
    if (!data || data.items.length >= data.total) return
    fetchData(true, undefined, data.items.length)
  }, [data, fetchData])

  // ── Tab change ────────────────────────────────────────────────────────
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab as 'photo' | 'video')
    setSelectedId(null)
    setCheckedIds(new Set())
  }, [])

  // ── Render ────────────────────────────────────────────────────────────
  const photoCount = stats?.byType.photo ?? 0
  const videoCount = stats?.byType.video ?? 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-border/50 px-4">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="h-10">
            <TabsTrigger value="photo" className="gap-1.5">
              Photo Sets
              <span className="text-[10px] text-muted-foreground">({photoCount})</span>
            </TabsTrigger>
            <TabsTrigger value="video" className="gap-1.5">
              Video Sets
              <span className="text-[10px] text-muted-foreground">({videoCount})</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <span className="ml-auto" />

        {/* Refresh participant statuses */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Refresh participant statuses"
          disabled={isRefreshing}
          onClick={async () => {
            setIsRefreshing(true)
            try {
              await refreshParticipantStatusesAction()
              // Re-fetch current data to reflect updated statuses
              fetchData(false)
            } finally {
              setIsRefreshing(false)
            }
          }}
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
        </Button>

        {/* Multi-select toggle */}
        <Button
          variant={isMultiSelectMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            if (isMultiSelectMode) {
              setIsMultiSelectMode(false)
              setCheckedIds(new Set())
            } else {
              setIsMultiSelectMode(true)
            }
          }}
        >
          <CheckSquare size={14} />
          {isMultiSelectMode ? 'Cancel' : 'Select'}
        </Button>
      </div>

      {/* Filter bar */}
      <StagingSetFilterBar
        filters={filters}
        onChange={setFilters}
        stats={stats}
      />

      {/* Summary line */}
      {stats && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border/30 px-4 py-1.5 text-[10px] text-muted-foreground">
          <span>{data?.total ?? 0} items</span>
          {stats.byMatchType.exact > 0 && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-500" />
              {stats.byMatchType.exact} exact
            </span>
          )}
          {stats.byMatchType.probable > 0 && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
              {stats.byMatchType.probable} probable
            </span>
          )}
        </div>
      )}

      {/* Main content: grid + slide panel */}
      <div className="flex min-h-0 flex-1">
        {/* Grid area */}
        <div className="flex-1 overflow-y-auto p-4" ref={gridRef}>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <StagingSetGrid
              items={data?.items ?? []}
              groupBy={filters.groupBy}
              focusedId={keyNav.focusedId}
              selectedId={selectedId}
              isMultiSelectMode={isMultiSelectMode}
              checkedIds={checkedIds}
              onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
              onToggleCheck={toggleCheck}
              onLoadMore={handleLoadMore}
              hasMore={!!data && data.items.length < data.total}
              isLoadingMore={isLoadingMore}
              total={data?.total ?? 0}
              scrollRef={gridRef}
              onVirtualizerReady={(fn) => { scrollToIndexRef.current = fn }}
            />
          )}
        </div>

        {/* Slide-out detail panel */}
        <StagingSetSlidePanel
          stagingSet={selectedSet}
          isOpen={isPanelOpen}
          onClose={() => setSelectedId(null)}
          onStatusChange={handleStatusChange}
          onPromote={handlePromote}
          onFieldUpdate={handleFieldUpdate}
          onRefresh={() => fetchData()}
          isProcessing={isProcessing}
        />
      </div>

      {/* Bulk action bar */}
      {isMultiSelectMode && checkedIds.size > 0 && (
        <div className="flex shrink-0 items-center gap-3 border-t border-border/50 bg-muted/50 px-4 py-2">
          <button
            onClick={selectAll}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {checkedIds.size === data?.items.length ? 'Deselect all' : 'Select all'}
          </button>
          <span className="text-xs font-medium">{checkedIds.size} selected</span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus('APPROVED')} disabled={isProcessing}>
              <Check size={14} /> Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus('INACTIVE')} disabled={isProcessing}>
              <Archive size={14} /> Inactive
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkStatus('SKIPPED')} disabled={isProcessing}>
              <X size={14} /> Skip
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
