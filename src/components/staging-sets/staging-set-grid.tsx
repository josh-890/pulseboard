'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, ImageIcon, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StagingSetRow } from './staging-set-row'
import type { StagingSetWithRelations } from '@/lib/services/import/staging-set-service'

// ─── Types ─────────────────────────────────────────────────────────────────

type GroupByMode = 'none' | 'channel' | 'person' | 'year' | 'status' | 'channelYear'

type FlatEntry =
  | { type: 'header'; key: string; count: number; level: number }
  | { type: 'item'; data: StagingSetWithRelations }
  | { type: 'sentinel' }

type StagingSetGridProps = {
  items: StagingSetWithRelations[]
  groupBy: GroupByMode
  focusedId: string | null
  selectedId: string | null
  isMultiSelectMode: boolean
  checkedIds: Set<string>
  onSelect: (id: string) => void
  onToggleCheck: (id: string) => void
  onLoadMore: () => void
  hasMore: boolean
  isLoadingMore: boolean
  total: number
  scrollRef: React.RefObject<HTMLDivElement | null>
  /** Called when virtualizer is ready — passes scrollToIndex for keyboard nav */
  onVirtualizerReady?: (scrollToIndex: (index: number) => void) => void
}

// ─── Grouping Logic ────────────────────────────────────────────────────────

const STATUS_ORDER: Record<string, number> = {
  PENDING: 0, REVIEWING: 1, APPROVED: 2, PROMOTED: 3, INACTIVE: 4, SKIPPED: 5,
}

function getGroupKey(item: StagingSetWithRelations, mode: GroupByMode): string {
  switch (mode) {
    case 'channel':
      return item.channelName || 'Unknown Channel'
    case 'person': {
      const participants = (item.participants as Array<{ name: string }>) ?? []
      return participants[0]?.name || 'Unknown Person'
    }
    case 'year': {
      if (!item.releaseDate) return 'Undated'
      return new Date(item.releaseDate).getFullYear().toString()
    }
    case 'status':
      return item.status
    default:
      return ''
  }
}

function sortGroupKeys(keys: string[], mode: GroupByMode): string[] {
  switch (mode) {
    case 'status':
      return [...keys].sort((a, b) => (STATUS_ORDER[a] ?? 99) - (STATUS_ORDER[b] ?? 99))
    case 'year':
      return [...keys].sort((a, b) => {
        if (a === 'Undated') return 1
        if (b === 'Undated') return -1
        return a.localeCompare(b)
      })
    default:
      return [...keys].sort((a, b) => a.localeCompare(b))
  }
}

type Group = { key: string; items: StagingSetWithRelations[]; subGroups?: Group[] }

function computeGroups(items: StagingSetWithRelations[], mode: GroupByMode): Group[] {
  if (mode === 'none') return [{ key: '', items }]

  // For channelYear, group by channel first, then sub-group by year
  const primaryMode = mode === 'channelYear' ? 'channel' : mode

  const map = new Map<string, StagingSetWithRelations[]>()
  for (const item of items) {
    const key = getGroupKey(item, primaryMode as GroupByMode)
    const arr = map.get(key)
    if (arr) arr.push(item)
    else map.set(key, [item])
  }

  const sortedKeys = sortGroupKeys(Array.from(map.keys()), primaryMode as GroupByMode)
  const groups: Group[] = sortedKeys.map((key) => ({ key, items: map.get(key)! }))

  if (mode === 'channelYear') {
    for (const group of groups) {
      const yearMap = new Map<string, StagingSetWithRelations[]>()
      for (const item of group.items) {
        const yearKey = getGroupKey(item, 'year')
        const arr = yearMap.get(yearKey)
        if (arr) arr.push(item)
        else yearMap.set(yearKey, [item])
      }
      const yearKeys = sortGroupKeys(Array.from(yearMap.keys()), 'year')
      group.subGroups = yearKeys.map((k) => ({ key: k, items: yearMap.get(k)! }))
    }
  }

  return groups
}

// ─── Flat entry builder ───────────────────────────────────────────────────

function buildFlatList(
  groups: Group[],
  groupBy: GroupByMode,
  collapsedGroups: Set<string>,
  hasMore: boolean,
): FlatEntry[] {
  const entries: FlatEntry[] = []

  for (const group of groups) {
    const showHeader = groupBy !== 'none'
    if (showHeader) {
      entries.push({ type: 'header', key: group.key, count: group.items.length, level: 1 })
    }
    if (!collapsedGroups.has(group.key)) {
      if (group.subGroups) {
        // Nested grouping (e.g. Channel → Year)
        for (const sub of group.subGroups) {
          const subKey = `${group.key}/${sub.key}`
          entries.push({ type: 'header', key: subKey, count: sub.items.length, level: 2 })
          if (!collapsedGroups.has(subKey)) {
            for (const item of sub.items) {
              entries.push({ type: 'item', data: item })
            }
          }
        }
      } else {
        for (const item of group.items) {
          entries.push({ type: 'item', data: item })
        }
      }
    }
  }

  // Sentinel for auto-loading
  if (hasMore) {
    entries.push({ type: 'sentinel' })
  }

  return entries
}

// ─── Size estimates ───────────────────────────────────────────────────────

const HEADER_HEIGHT = 48
const SUB_HEADER_HEIGHT = 32
const ITEM_HEIGHT = 100
const SENTINEL_HEIGHT = 48

function estimateSize(entry: FlatEntry): number {
  switch (entry.type) {
    case 'header': return entry.level === 2 ? SUB_HEADER_HEIGHT : HEADER_HEIGHT
    case 'item': return ITEM_HEIGHT
    case 'sentinel': return SENTINEL_HEIGHT
  }
}

// ─── Component ─────────────────────────────────────────────────────────────

export function StagingSetGrid({
  items,
  groupBy,
  focusedId,
  selectedId,
  isMultiSelectMode,
  checkedIds,
  onSelect,
  onToggleCheck,
  onLoadMore,
  hasMore,
  isLoadingMore,
  total,
  scrollRef,
  onVirtualizerReady,
}: StagingSetGridProps) {
  // Track collapsed groups + a default mode for newly loaded groups
  // Persist to sessionStorage so state survives tab switches and page revisits
  const COLLAPSE_STORAGE_KEY = 'pulseboard-staging-collapse'

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set<string>())
  const [defaultCollapsed, setDefaultCollapsed] = useState(false)

  const prevGroupByRef = useRef(groupBy)
  const skipNextSaveRef = useRef(false)

  // Restore collapse state from sessionStorage after hydration
  const collapseRestoredRef = useRef(false)
  useEffect(() => {
    if (collapseRestoredRef.current) return
    collapseRestoredRef.current = true
    try {
      const saved = sessionStorage.getItem(COLLAPSE_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.groupBy === groupBy) {
          skipNextSaveRef.current = true
          setCollapsedGroups(new Set<string>(parsed.groups))
          setDefaultCollapsed(parsed.defaultCollapsed ?? false)
        }
      }
    } catch {}
  }, [groupBy])

  const groups = useMemo(() => computeGroups(items, groupBy), [items, groupBy])

  // All collapsible keys
  const allGroupKeys = useMemo(() => {
    const keys: string[] = []
    for (const group of groups) {
      if (groupBy === 'none') continue
      keys.push(group.key)
      if (group.subGroups) {
        for (const sub of group.subGroups) {
          keys.push(`${group.key}/${sub.key}`)
        }
      }
    }
    return keys
  }, [groups, groupBy])

  // Persist/restore collapse state to sessionStorage

  // On groupBy change: restore from storage or reset
  useEffect(() => {
    if (prevGroupByRef.current !== groupBy) {
      prevGroupByRef.current = groupBy
      if (groupBy === 'none') return
      try {
        const saved = sessionStorage.getItem(COLLAPSE_STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed.groupBy === groupBy) {
            skipNextSaveRef.current = true // Don't overwrite storage with restored state
            setCollapsedGroups(new Set<string>(parsed.groups))
            setDefaultCollapsed(parsed.defaultCollapsed ?? false)
            return
          }
        }
      } catch {}
      setCollapsedGroups(new Set())
      setDefaultCollapsed(false)
    }
  }, [groupBy])

  // Save collapse state when it changes (skip saves triggered by restore)
  useEffect(() => {
    if (groupBy === 'none') return
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    try {
      sessionStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify({
        groupBy,
        defaultCollapsed,
        groups: [...collapsedGroups],
      }))
    } catch {}
  }, [groupBy, defaultCollapsed, collapsedGroups])

  // Effective collapsed set: in "default collapsed" mode, all keys are collapsed
  // except those explicitly expanded (toggled). In normal mode, only explicitly
  // collapsed keys are collapsed.
  const effectiveCollapsed = useMemo(() => {
    if (!defaultCollapsed) return collapsedGroups
    // Default collapsed: all keys minus those in the "expanded exceptions" set
    const set = new Set(allGroupKeys)
    for (const key of collapsedGroups) set.delete(key)
    return set
  }, [defaultCollapsed, collapsedGroups, allGroupKeys])

  const collapseAll = () => {
    setDefaultCollapsed(true)
    setCollapsedGroups(new Set()) // clear exceptions
  }
  const expandAll = () => {
    setDefaultCollapsed(false)
    setCollapsedGroups(new Set()) // clear exceptions
  }
  const flatList = useMemo(
    () => buildFlatList(groups, groupBy, effectiveCollapsed, hasMore),
    [groups, groupBy, effectiveCollapsed, hasMore],
  )

  // Stable key function so virtualizer tracks items across expand/collapse
  const getItemKey = useCallback((index: number) => {
    const entry = flatList[index]
    if (entry.type === 'item') return entry.data.id
    if (entry.type === 'header') return `h:${entry.key}`
    return 'sentinel'
  }, [flatList])

  const virtualizer = useVirtualizer({
    count: flatList.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateSize(flatList[index]),
    getItemKey,
    overscan: 10,
  })

  // Expose scrollToIndex to parent for keyboard nav
  useEffect(() => {
    if (onVirtualizerReady) {
      onVirtualizerReady((index: number) => {
        virtualizer.scrollToIndex(index, { align: 'auto' })
      })
    }
  }, [onVirtualizerReady, virtualizer])

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /** Expand or collapse all level-2 children of a level-1 group */
  const toggleChildren = (parentKey: string) => {
    const childKeys = allGroupKeys.filter((k) => k.startsWith(parentKey + '/'))
    const allChildrenExpanded = childKeys.every((k) => !effectiveCollapsed.has(k))
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (defaultCollapsed) {
        // In defaultCollapsed mode, collapsedGroups holds EXCEPTIONS (expanded items)
        // To expand children: add them as exceptions
        // To collapse children: remove exceptions
        for (const k of childKeys) {
          if (allChildrenExpanded) next.delete(k) // remove exception → re-collapse
          else next.add(k) // add exception → expand
        }
      } else {
        // Normal mode: collapsed set = what's collapsed
        for (const k of childKeys) {
          if (allChildrenExpanded) next.add(k)
          else next.delete(k)
        }
      }
      return next
    })
  }

  // ── Auto-load when near bottom ────────────────────────────────────────
  const hasMoreRef = useRef(hasMore)
  const isLoadingMoreRef = useRef(isLoadingMore)
  const onLoadMoreRef = useRef(onLoadMore)
  hasMoreRef.current = hasMore
  isLoadingMoreRef.current = isLoadingMore
  onLoadMoreRef.current = onLoadMore

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el || !hasMoreRef.current || isLoadingMoreRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollTop + clientHeight >= scrollHeight - 300) {
      onLoadMoreRef.current()
    }
  }, [scrollRef])

  // Scroll listener
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', checkNearBottom, { passive: true })
    return () => el.removeEventListener('scroll', checkNearBottom)
  }, [scrollRef, checkNearBottom])

  // Also check after new data arrives — user may already be near bottom
  useEffect(() => {
    checkNearBottom()
  }, [flatList.length, isLoadingMore, checkNearBottom])

  // ── Scroll position indicator ────────────────────────────────────────
  const virtualItems = virtualizer.getVirtualItems()
  const visibleItemEntries = virtualItems
    .map((vi) => ({ vi, entry: flatList[vi.index] }))
    .filter((e) => e.entry.type === 'item')

  const firstVisibleItemIndex = visibleItemEntries.length > 0
    ? items.indexOf((visibleItemEntries[0].entry as { type: 'item'; data: StagingSetWithRelations }).data) + 1
    : 0
  const lastVisibleItemIndex = visibleItemEntries.length > 0
    ? Math.min(
        items.indexOf((visibleItemEntries[visibleItemEntries.length - 1].entry as { type: 'item'; data: StagingSetWithRelations }).data) + 1,
        total,
      )
    : 0

  // ── Empty state ──────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ImageIcon size={48} className="mb-3 text-muted-foreground/30" />
        <p className="text-muted-foreground">No staging sets match your filters</p>
        <p className="mt-1 text-sm text-muted-foreground/60">
          Try adjusting your search or filters.
        </p>
      </div>
    )
  }

  const isGrouped = groupBy !== 'none'
  const allCollapsed = isGrouped && effectiveCollapsed.size >= allGroupKeys.length

  return (
    <>
      {/* Collapse / Expand all */}
      {isGrouped && (
        <div className="mb-2 flex items-center gap-2">
          <button
            onClick={allCollapsed ? expandAll : collapseAll}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        </div>
      )}

      {/* Virtual list container */}
      <div
        style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
      >
        {virtualItems.map((virtualRow) => {
          const entry = flatList[virtualRow.index]
          // Use stable keys: staging set ID for items, group key for headers
          const stableKey = entry.type === 'item' ? entry.data.id
            : entry.type === 'header' ? `h:${entry.key}`
            : 'sentinel'

          return (
            <div
              key={stableKey}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                zIndex: entry.type === 'header' ? (entry.level === 1 ? 2 : 1) : 0,
              }}
            >
              {entry.type === 'header' && (
                <div className={cn(
                  'flex w-full items-center gap-2 bg-background/95 backdrop-blur-sm',
                  entry.level === 1 && 'mt-2 border-b border-border/40 pb-1',
                )}>
                  <button
                    onClick={() => toggleGroup(entry.key)}
                    className={cn(
                      'flex flex-1 items-center gap-2 text-left',
                      entry.level === 2 ? 'pl-6 py-1.5' : 'py-2.5',
                    )}
                  >
                    {effectiveCollapsed.has(entry.key) ? (
                      <ChevronRight size={entry.level === 2 ? 13 : 16} className="text-muted-foreground" />
                    ) : (
                      <ChevronDown size={entry.level === 2 ? 13 : 16} className="text-muted-foreground" />
                    )}
                    <span className={entry.level === 2
                      ? 'text-xs font-medium text-muted-foreground'
                      : 'text-sm font-semibold'
                    }>
                      {entry.key.includes('/') ? entry.key.split('/').pop() : entry.key}
                    </span>
                    <span className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                      entry.level === 1
                        ? 'bg-muted text-muted-foreground'
                        : 'text-muted-foreground/70',
                    )}>
                      {entry.count}
                    </span>
                    {entry.level === 2 && <span className="flex-1 border-b border-border/20" />}
                  </button>
                  {entry.level === 1 && groupBy === 'channelYear' && !effectiveCollapsed.has(entry.key) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleChildren(entry.key) }}
                      className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground"
                      title={
                        allGroupKeys.filter((k) => k.startsWith(entry.key + '/')).every((k) => !effectiveCollapsed.has(k))
                          ? 'Collapse all years'
                          : 'Expand all years'
                      }
                    >
                      {allGroupKeys.filter((k) => k.startsWith(entry.key + '/')).every((k) => !effectiveCollapsed.has(k))
                        ? <ChevronsDownUp size={14} />
                        : <ChevronsUpDown size={14} />}
                    </button>
                  )}
                </div>
              )}

              {entry.type === 'item' && (
                <div className="pb-2">
                  <StagingSetRow
                    stagingSet={entry.data}
                    isSelected={selectedId === entry.data.id}
                    isFocused={focusedId === entry.data.id}
                    isMultiSelectMode={isMultiSelectMode}
                    isChecked={checkedIds.has(entry.data.id)}
                    onSelect={onSelect}
                    onToggleCheck={onToggleCheck}
                  />
                </div>
              )}

              {entry.type === 'sentinel' && (
                <div className="flex items-center justify-center py-3">
                  {isLoadingMore && (
                    <Loader2 size={16} className="animate-spin text-muted-foreground" />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Scroll position indicator */}
      {total > 0 && firstVisibleItemIndex > 0 && (
        <div className="sticky bottom-0 z-10 flex items-center justify-center border-t border-border/30 bg-background/90 py-1.5 text-[11px] text-muted-foreground backdrop-blur-sm">
          Showing {firstVisibleItemIndex}–{lastVisibleItemIndex} of {total} items
          {isLoadingMore && (
            <Loader2 size={10} className="ml-2 animate-spin" />
          )}
        </div>
      )}
    </>
  )
}

/** Get the flat list of visible item IDs (for keyboard navigation) */
export function getVisibleItemIds(
  items: StagingSetWithRelations[],
  groupBy: GroupByMode,
  collapsedGroups: Set<string>,
): string[] {
  if (groupBy === 'none') return items.map((i) => i.id)

  const groups = computeGroups(items, groupBy)
  const ids: string[] = []
  for (const group of groups) {
    if (collapsedGroups.has(group.key)) continue
    if (group.subGroups) {
      for (const sub of group.subGroups) {
        const subKey = `${group.key}/${sub.key}`
        if (!collapsedGroups.has(subKey)) {
          for (const item of sub.items) ids.push(item.id)
        }
      }
    } else {
      for (const item of group.items) ids.push(item.id)
    }
  }
  return ids
}
