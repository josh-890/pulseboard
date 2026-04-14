'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { FolderSearch, Camera, Film, ChevronDown, Search, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getArchiveItemsAction } from '@/lib/actions/archive-actions'
import { ArchiveOrphanRow } from './archive-orphan-row'
import { ArchiveLinkedRow } from './archive-linked-row'
import { ArchivePhantomRow } from './archive-phantom-row'
import { ArchiveUntrackedRow } from './archive-untracked-row'
import { ArchiveChannelHeader } from './archive-channel-header'
import { ArchiveYearSubheader } from './archive-year-subheader'
import type {
  WorkspaceCounts,
  WorkspacePage,
  ArchiveFolderEntry,
  PhantomEntry,
  UntrackedEntry,
  GroupBy,
  ArchiveSort,
  SortDir,
} from '@/lib/services/archive-service'

// ─── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'orphan' | 'linked' | 'phantom' | 'untracked'

type VirtualRow =
  | { kind: 'channel-header'; channel: string; count: number }
  | { kind: 'year-header'; channel: string; year: string; count: number }
  | { kind: 'folder-item'; item: ArchiveFolderEntry }
  | { kind: 'flat-item'; item: PhantomEntry | UntrackedEntry; itemType: 'phantom' | 'untracked' }
  | { kind: 'loading-sentinel' }

type Props = {
  initialPage: WorkspacePage
  initialTab: Tab
  initialIsVideo?: boolean
  initialHasSuggestion?: boolean
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TAB_CONFIG: Record<Tab, { label: string; emptyMsg: string; badge: string }> = {
  orphan:    { label: 'Orphans',   emptyMsg: 'No unmatched folders found.',       badge: 'bg-red-500/20 text-red-600 dark:text-red-400' },
  linked:    { label: 'Linked',    emptyMsg: 'No linked folders yet.',             badge: 'bg-green-500/20 text-green-600 dark:text-green-400' },
  phantom:   { label: 'Phantoms',  emptyMsg: 'No missing archive folders found.', badge: 'bg-amber-500/20 text-amber-600 dark:text-amber-400' },
  untracked: { label: 'Untracked', emptyMsg: 'All records have archive paths.',   badge: 'bg-gray-400/20 text-gray-500 dark:text-gray-400' },
}

const GROUP_BY_LABELS: Record<GroupBy, string> = {
  channelYear: 'Channel + Year',
  channel: 'Channel',
  year: 'Year',
  none: 'None',
}

const SORT_LABELS: Record<ArchiveSort, string> = {
  date: 'Date',
  name: 'Name',
  fileCount: 'File count',
}

const SESSION_KEY = 'archive-workspace-filters'
const COLLAPSE_KEY = 'archive-workspace-collapse'
const PAGE_SIZE = 200
const ITEM_HEIGHT = 80    // estimated px per folder row
const CHANNEL_H  = 48
const YEAR_H     = 32
const SENTINEL_H = 48

// ─── Grouping logic ────────────────────────────────────────────────────────────

function getYear(item: ArchiveFolderEntry): string {
  if (!item.parsedDate) return 'Undated'
  return String(new Date(item.parsedDate).getFullYear())
}

function buildVirtualRows(
  items: ArchiveFolderEntry[],
  groupBy: GroupBy,
  collapseState: Record<string, boolean>,
  hasMore: boolean,
): VirtualRow[] {
  const rows: VirtualRow[] = []

  if (groupBy === 'none') {
    for (const item of items) rows.push({ kind: 'folder-item', item })
  } else if (groupBy === 'year') {
    let curYear = ''
    for (const item of items) {
      const yr = getYear(item)
      if (yr !== curYear) {
        curYear = yr
        // count items in this year
        const count = items.filter((i) => getYear(i) === yr).length
        rows.push({ kind: 'channel-header', channel: yr, count })
      }
      if (!collapseState[`yr::${curYear}`]) {
        rows.push({ kind: 'folder-item', item })
      }
    }
  } else if (groupBy === 'channel') {
    let curCh = ''
    for (const item of items) {
      const ch = item.parsedShortName ?? '(unknown)'
      if (ch !== curCh) {
        curCh = ch
        const count = items.filter((i) => (i.parsedShortName ?? '(unknown)') === ch).length
        rows.push({ kind: 'channel-header', channel: ch, count })
      }
      if (!collapseState[`ch::${curCh}`]) {
        rows.push({ kind: 'folder-item', item })
      }
    }
  } else {
    // channelYear — two-level
    let curCh = ''
    let curYr = ''
    for (const item of items) {
      const ch = item.parsedShortName ?? '(unknown)'
      const yr = getYear(item)

      if (ch !== curCh) {
        curCh = ch
        curYr = ''
        const count = items.filter((i) => (i.parsedShortName ?? '(unknown)') === ch).length
        rows.push({ kind: 'channel-header', channel: ch, count })
      }
      const chCollapsed = collapseState[`ch::${ch}`]
      if (chCollapsed) continue

      if (yr !== curYr) {
        curYr = yr
        const count = items.filter(
          (i) => (i.parsedShortName ?? '(unknown)') === ch && getYear(i) === yr,
        ).length
        rows.push({ kind: 'year-header', channel: ch, year: yr, count })
      }
      if (!collapseState[`yr::${ch}::${yr}`]) {
        rows.push({ kind: 'folder-item', item })
      }
    }
  }

  if (hasMore) rows.push({ kind: 'loading-sentinel' })
  return rows
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ArchiveWorkspaceClient({
  initialPage,
  initialTab,
  initialIsVideo,
  initialHasSuggestion,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [counts, setCounts] = useState<WorkspaceCounts>(initialPage.counts)

  // Folder items (for orphan / linked tabs)
  const [folderItems, setFolderItems] = useState<ArchiveFolderEntry[]>(
    initialPage.items as ArchiveFolderEntry[],
  )
  // Flat items (for phantom / untracked tabs — no grouping)
  const [flatItems, setFlatItems] = useState<(PhantomEntry | UntrackedEntry)[]>(
    (tab === 'phantom' || tab === 'untracked') ? initialPage.items as (PhantomEntry | UntrackedEntry)[] : [],
  )
  const [total, setTotal] = useState(initialPage.total)
  const [hasMore, setHasMore] = useState(initialPage.hasMore)
  const [loading, setLoading] = useState(false)

  // Filter state
  const [groupBy, setGroupBy] = useState<GroupBy>('channelYear')
  const [sort, setSort] = useState<ArchiveSort>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [isVideo, setIsVideo] = useState<boolean | undefined>(initialIsVideo)
  const [hasSuggestion, setHasSuggestion] = useState(initialHasSuggestion ?? false)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')  // debounced

  // Collapse state
  const [collapseState, setCollapseState] = useState<Record<string, boolean>>({})

  const scrollRef = useRef<HTMLDivElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Session storage restore ────────────────────────────────────────────────
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<{
          groupBy: GroupBy; sort: ArchiveSort; sortDir: SortDir; isVideo: boolean | null
        }>
        if (parsed.groupBy) setGroupBy(parsed.groupBy)
        if (parsed.sort) setSort(parsed.sort)
        if (parsed.sortDir) setSortDir(parsed.sortDir)
        if (parsed.isVideo !== undefined) setIsVideo(parsed.isVideo ?? undefined)
      }
      const savedCollapse = sessionStorage.getItem(COLLAPSE_KEY)
      if (savedCollapse) setCollapseState(JSON.parse(savedCollapse))
    } catch { /* ignore */ }
    setHydrated(true)
  }, [])

  function persistFilters(patch: Partial<{ groupBy: GroupBy; sort: ArchiveSort; sortDir: SortDir; isVideo: boolean | null }>) {
    try {
      const current = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '{}')
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...current, ...patch }))
    } catch { /* ignore */ }
  }

  function persistCollapse(next: Record<string, boolean>) {
    try { sessionStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  // ── Data fetching ──────────────────────────────────────────────────────────
  const isFolderTab = tab === 'orphan' || tab === 'linked'

  const buildFilters = useCallback((offset: number) => ({
    tab,
    isVideo,
    hasSuggestion: hasSuggestion || undefined,
    search: search || undefined,
    sort,
    sortDir,
    groupBy,
    offset,
    pageSize: PAGE_SIZE,
  }), [tab, isVideo, hasSuggestion, search, sort, sortDir, groupBy])

  // Reset + reload when filters change
  useEffect(() => {
    if (!hydrated) return
    let cancelled = false
    setLoading(true)
    getArchiveItemsAction(buildFilters(0)).then((page) => {
      if (cancelled) return
      setCounts(page.counts)
      setTotal(page.total)
      setHasMore(page.hasMore)
      if (isFolderTab) {
        setFolderItems(page.items as ArchiveFolderEntry[])
        setFlatItems([])
      } else {
        setFlatItems(page.items as (PhantomEntry | UntrackedEntry)[])
        setFolderItems([])
      }
      setLoading(false)
    }).catch(() => setLoading(false))
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isVideo, hasSuggestion, search, sort, sortDir, groupBy, hydrated])

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return
    const offset = isFolderTab ? folderItems.length : flatItems.length
    setLoading(true)
    getArchiveItemsAction(buildFilters(offset)).then((page) => {
      setHasMore(page.hasMore)
      if (isFolderTab) {
        setFolderItems((prev) => [...prev, ...(page.items as ArchiveFolderEntry[])])
      } else {
        setFlatItems((prev) => [...prev, ...(page.items as (PhantomEntry | UntrackedEntry)[])])
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [loading, hasMore, isFolderTab, folderItems.length, flatItems.length, buildFilters])

  // ── Virtual rows ───────────────────────────────────────────────────────────
  const virtualRows = useMemo<VirtualRow[]>(() => {
    if (isFolderTab) {
      return buildVirtualRows(folderItems, groupBy, collapseState, hasMore)
    }
    // phantom / untracked — flat list
    const rows: VirtualRow[] = flatItems.map((item) => ({
      kind: 'flat-item' as const,
      item,
      itemType: (tab === 'phantom' ? 'phantom' : 'untracked') as 'phantom' | 'untracked',
    }))
    if (hasMore) rows.push({ kind: 'loading-sentinel' })
    return rows
  }, [isFolderTab, folderItems, flatItems, groupBy, collapseState, hasMore, tab])

  // ── Virtualizer ────────────────────────────────────────────────────────────
  const virtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => {
      const row = virtualRows[i]
      if (!row) return ITEM_HEIGHT
      if (row.kind === 'channel-header') return CHANNEL_H
      if (row.kind === 'year-header') return YEAR_H
      if (row.kind === 'loading-sentinel') return SENTINEL_H
      return ITEM_HEIGHT
    },
    overscan: 10,
  })

  // ── Infinite scroll trigger ────────────────────────────────────────────────
  const vItems = virtualizer.getVirtualItems()
  useEffect(() => {
    if (!vItems.length || !hasMore || loading) return
    const last = vItems[vItems.length - 1]
    if (last && last.index >= virtualRows.length - 6) {
      loadMore()
    }
  }, [vItems, hasMore, loading, virtualRows.length, loadMore])

  // ── Tab switch ─────────────────────────────────────────────────────────────
  function switchTab(t: Tab) {
    setTab(t)
    setFolderItems([])
    setFlatItems([])
    setHasMore(false)
    setSearch('')
    setSearchInput('')
  }

  // ── Filter helpers ─────────────────────────────────────────────────────────
  function setGroupByAndPersist(v: GroupBy) {
    setGroupBy(v); persistFilters({ groupBy: v })
  }
  function setSortAndPersist(v: ArchiveSort) {
    setSort(v); persistFilters({ sort: v })
  }
  function toggleSortDir() {
    const next: SortDir = sortDir === 'desc' ? 'asc' : 'desc'
    setSortDir(next); persistFilters({ sortDir: next })
  }
  function setIsVideoAndPersist(v: boolean | undefined) {
    setIsVideo(v); persistFilters({ isVideo: v ?? null })
  }

  // ── Search debounce ────────────────────────────────────────────────────────
  function handleSearchChange(val: string) {
    setSearchInput(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearch(val), 300)
  }

  // ── Collapse helpers ───────────────────────────────────────────────────────
  function toggleCollapse(key: string) {
    setCollapseState((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      persistCollapse(next)
      return next
    })
  }

  function collapseAll() {
    const next: Record<string, boolean> = {}
    for (const row of virtualRows) {
      if (row.kind === 'channel-header') next[`ch::${row.channel}`] = true
      if (row.kind === 'year-header') next[`yr::${row.channel}::${row.year}`] = true
    }
    // Also collect from all folderItems to cover collapsed groups
    for (const item of folderItems) {
      const ch = item.parsedShortName ?? '(unknown)'
      const yr = getYear(item)
      next[`ch::${ch}`] = true
      next[`yr::${ch}::${yr}`] = true
    }
    setCollapseState(next)
    persistCollapse(next)
  }

  function expandAll() {
    setCollapseState({})
    persistCollapse({})
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const showGroupControls = isFolderTab

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-0 p-4">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <FolderSearch size={20} className="text-muted-foreground" />
        <h1 className="text-2xl font-bold">Archive</h1>
        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
          {total.toLocaleString()} total
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/30 bg-card/70 shadow-lg backdrop-blur-md dark:border-white/10">
        {/* Tab strip */}
        <div className="flex flex-wrap gap-2 border-b border-border/40 px-4 pt-3 pb-3">
          {(Object.keys(TAB_CONFIG) as Tab[]).map((t) => {
            const cfg = TAB_CONFIG[t]
            const count = counts[t]
            const active = tab === t
            return (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'border-primary/50 bg-primary/15 text-primary'
                    : 'border-border/50 bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                )}
              >
                {cfg.label}
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', cfg.badge)}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Filter bar */}
        <div className="flex flex-col gap-2 border-b border-border/30 px-4 py-2.5">
          {/* Row 1: media type + suggestion + search */}
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'photo', 'video'] as const).map((mode) => {
              const active =
                mode === 'all' ? isVideo === undefined
                : mode === 'photo' ? isVideo === false
                : isVideo === true
              return (
                <button
                  key={mode}
                  onClick={() => setIsVideoAndPersist(mode === 'all' ? undefined : mode === 'video')}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                    active
                      ? 'border-primary/50 bg-primary/15 text-primary'
                      : 'border-border/50 bg-muted/40 text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  {mode === 'photo' && <Camera size={11} />}
                  {mode === 'video' && <Film size={11} />}
                  {mode === 'all' ? 'All' : mode === 'photo' ? 'Photos' : 'Videos'}
                </button>
              )
            })}

            {tab === 'orphan' && (
              <button
                onClick={() => setHasSuggestion(!hasSuggestion)}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                  hasSuggestion
                    ? 'border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'border-border/50 bg-muted/40 text-muted-foreground hover:bg-muted/60',
                )}
              >
                Has suggestion
              </button>
            )}

            {/* Search */}
            {(tab === 'orphan' || tab === 'linked') && (
              <div className="ml-auto flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2.5 py-0.5">
                <Search size={11} className="text-muted-foreground/60" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search folders…"
                  className="w-40 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none"
                />
              </div>
            )}
          </div>

          {/* Row 2: groupBy + sort + collapse controls */}
          {showGroupControls && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Group by */}
              <div className="relative flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2.5 py-0.5">
                <span className="text-[10px] text-muted-foreground">Group:</span>
                <select
                  value={groupBy}
                  onChange={(e) => setGroupByAndPersist(e.target.value as GroupBy)}
                  className="bg-transparent text-xs text-foreground outline-none cursor-pointer"
                >
                  {(Object.keys(GROUP_BY_LABELS) as GroupBy[]).map((k) => (
                    <option key={k} value={k}>{GROUP_BY_LABELS[k]}</option>
                  ))}
                </select>
              </div>

              {/* Sort — only relevant when groupBy=none */}
              {groupBy === 'none' && (
                <>
                  <div className="flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2.5 py-0.5">
                    <span className="text-[10px] text-muted-foreground">Sort:</span>
                    <select
                      value={sort}
                      onChange={(e) => setSortAndPersist(e.target.value as ArchiveSort)}
                      className="bg-transparent text-xs text-foreground outline-none cursor-pointer"
                    >
                      {(Object.keys(SORT_LABELS) as ArchiveSort[]).map((k) => (
                        <option key={k} value={k}>{SORT_LABELS[k]}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={toggleSortDir}
                    title={sortDir === 'desc' ? 'Descending' : 'Ascending'}
                    className="flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronDown size={11} className={cn('transition-transform', sortDir === 'asc' && 'rotate-180')} />
                  </button>
                </>
              )}

              {/* Collapse / expand — only when grouped */}
              {groupBy !== 'none' && (
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={collapseAll}
                    title="Collapse all"
                    className="flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronsDownUp size={11} />
                    Collapse all
                  </button>
                  <button
                    onClick={expandAll}
                    title="Expand all"
                    className="flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronsUpDown size={11} />
                    Expand all
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Virtualized list */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {virtualRows.length === 0 && !loading ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <FolderSearch size={32} className="opacity-20" />
              <p className="text-sm">{TAB_CONFIG[tab].emptyMsg}</p>
            </div>
          ) : (
            <div
              style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
            >
              {virtualizer.getVirtualItems().map((vItem) => {
                const row = virtualRows[vItem.index]
                if (!row) return null
                return (
                  <div
                    key={vItem.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vItem.start}px)`,
                    }}
                  >
                    {row.kind === 'channel-header' && (
                      <ArchiveChannelHeader
                        channel={row.channel}
                        count={row.count}
                        collapsed={!!(collapseState[`ch::${row.channel}`])}
                        onToggle={() => toggleCollapse(`ch::${row.channel}`)}
                      />
                    )}
                    {row.kind === 'year-header' && (
                      <ArchiveYearSubheader
                        year={row.year}
                        count={row.count}
                        collapsed={!!(collapseState[`yr::${row.channel}::${row.year}`])}
                        onToggle={() => toggleCollapse(`yr::${row.channel}::${row.year}`)}
                      />
                    )}
                    {row.kind === 'folder-item' && tab === 'orphan' && (
                      <div className="py-0.5">
                        <ArchiveOrphanRow item={row.item} />
                      </div>
                    )}
                    {row.kind === 'folder-item' && tab === 'linked' && (
                      <div className="py-0.5">
                        <ArchiveLinkedRow item={row.item} />
                      </div>
                    )}
                    {row.kind === 'flat-item' && row.itemType === 'phantom' && (
                      <div className="py-0.5">
                        <ArchivePhantomRow item={row.item as PhantomEntry} />
                      </div>
                    )}
                    {row.kind === 'flat-item' && row.itemType === 'untracked' && (
                      <div className="py-0.5">
                        <ArchiveUntrackedRow item={row.item as UntrackedEntry} />
                      </div>
                    )}
                    {row.kind === 'loading-sentinel' && (
                      <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                        {loading ? 'Loading…' : ''}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="border-t border-border/30 px-4 py-1.5 text-[10px] text-muted-foreground">
          {loading && folderItems.length === 0 && flatItems.length === 0
            ? 'Loading…'
            : `${(isFolderTab ? folderItems.length : flatItems.length).toLocaleString()} of ${total.toLocaleString()} loaded`
          }
        </div>
      </div>
    </div>
  )
}
