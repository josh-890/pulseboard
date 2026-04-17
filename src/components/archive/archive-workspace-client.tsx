'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { FolderSearch, Camera, Film, ChevronDown, Search, ChevronsDownUp, ChevronsUpDown, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getArchiveItemsAction, getArchiveChannelSummariesAction, reparseFolderNamesAction } from '@/lib/actions/archive-actions'
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
  ChannelSummary,
} from '@/lib/services/archive-service'

// ─── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'orphan' | 'linked' | 'phantom' | 'untracked'

type VirtualRow =
  | { kind: 'channel-header'; channel: string; count: number }
  | { kind: 'year-header'; channel: string; year: string; count: number }
  | { kind: 'folder-item'; item: ArchiveFolderEntry }
  | { kind: 'flat-item'; item: PhantomEntry | UntrackedEntry; itemType: 'phantom' | 'untracked' }
  | { kind: 'loading-sentinel'; channel?: string }

type ChannelLeafState =
  | { status: 'unloaded' }
  | { status: 'loading' }
  | { status: 'loaded'; items: ArchiveFolderEntry[] }

type Props = {
  initialPage: WorkspacePage
  initialTab: Tab
  initialIsVideo?: boolean
  initialHasSuggestion?: boolean
  highlightId?: string
  /** Pre-fetched channel summaries for the tree view (orphan/linked tabs only). */
  initialChannelSummaries: ChannelSummary[] | null
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TAB_CONFIG: Record<Tab, { label: string; emptyMsg: string; badge: string }> = {
  orphan:    { label: 'Orphans',   emptyMsg: 'No unmatched folders found.',       badge: 'bg-red-500/20 text-red-600 dark:text-red-400' },
  linked:    { label: 'Linked',    emptyMsg: 'No linked folders yet.',             badge: 'bg-green-500/20 text-green-600 dark:text-green-400' },
  phantom:   { label: 'Phantoms',  emptyMsg: 'No missing archive folders found.', badge: 'bg-amber-500/20 text-amber-600 dark:text-amber-400' },
  untracked: { label: 'Untracked', emptyMsg: 'All records have archive paths.',   badge: 'bg-gray-400/20 text-gray-500 dark:text-gray-400' },
}

const GROUP_BY_LABELS: Record<GroupBy, string> = {
  channelYear: 'Tree view',
  channel: 'Channel',
  year: 'Year',
  none: 'None',
}

const SORT_LABELS: Record<ArchiveSort, string> = {
  date: 'Date',
  name: 'Name',
  fileCount: 'File count',
}

const SESSION_KEY    = 'archive-workspace-filters-v2'
const COLLAPSE_KEY   = 'archive-workspace-collapse-v2'
const PAGE_SIZE      = 200
const LINKED_H       = 52   // linked row: py-3 + single line + wrapper
const ORPHAN_H       = 72   // orphan row: py-3 + main + path line + wrapper
const ORPHAN_SUG_H   = 124  // orphan row when suggestion banner is visible
const FLAT_ITEM_H    = 56   // phantom / untracked rows
const CHANNEL_H      = 38   // channel header: py-2.5 + content
const YEAR_H         = 24   // year subheader: py-1 + content
const SENTINEL_H     = 48

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getYear(item: ArchiveFolderEntry): string {
  if (!item.parsedDate) return 'Undated'
  return String(new Date(item.parsedDate).getFullYear())
}

// Resolve the channel folder name from the stored field, falling back to fullPath extraction.
function getChanFolder(item: ArchiveFolderEntry): string {
  if (item.chanFolderName) return item.chanFolderName
  const clean = item.fullPath.replace(/[/\\]+$/, '')
  const parts = clean.split(/[/\\]/)
  return parts[parts.length - 3] ?? '(unknown)'
}

// Collapse model: allCollapsed=true means everything collapsed by default;
// exceptions (explicitly expanded) live in `exceptions`. When allCollapsed=false,
// exceptions are explicitly collapsed items. This way new pages automatically
// respect the global collapsed/expanded state.
type CollapseModel = { allCollapsed: boolean; exceptions: Set<string> }

function isCollapsed(model: CollapseModel, key: string): boolean {
  return model.allCollapsed ? !model.exceptions.has(key) : model.exceptions.has(key)
}

function buildVirtualRowsFlat(
  items: ArchiveFolderEntry[],
  groupBy: GroupBy,
  model: CollapseModel,
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
        const count = items.filter((i) => getYear(i) === yr).length
        rows.push({ kind: 'channel-header', channel: yr, count })
      }
      if (!isCollapsed(model, `yr::${curYear}`)) {
        rows.push({ kind: 'folder-item', item })
      }
    }
  } else if (groupBy === 'channel') {
    let curCh = ''
    for (const item of items) {
      const ch = getChanFolder(item)
      if (ch !== curCh) {
        curCh = ch
        const count = items.filter((i) => getChanFolder(i) === ch).length
        rows.push({ kind: 'channel-header', channel: ch, count })
      }
      if (!isCollapsed(model, `ch::${ch}`)) {
        rows.push({ kind: 'folder-item', item })
      }
    }
  } else {
    // channelYear — two-level (flat mode fallback, not used in tree mode)
    let curCh = ''
    let curYr = ''
    for (const item of items) {
      const ch = getChanFolder(item)
      const yr = getYear(item)

      if (ch !== curCh) {
        curCh = ch
        curYr = ''
        const count = items.filter((i) => getChanFolder(i) === ch).length
        rows.push({ kind: 'channel-header', channel: ch, count })
      }
      if (isCollapsed(model, `ch::${ch}`)) continue

      if (yr !== curYr) {
        curYr = yr
        const count = items.filter(
          (i) => getChanFolder(i) === ch && getYear(i) === yr,
        ).length
        rows.push({ kind: 'year-header', channel: ch, year: yr, count })
      }
      if (!isCollapsed(model, `yr::${ch}::${yr}`)) {
        rows.push({ kind: 'folder-item', item })
      }
    }
  }

  if (hasMore) rows.push({ kind: 'loading-sentinel' })
  return rows
}

function buildVirtualRowsTree(
  summaries: ChannelSummary[],
  channelLeaves: Map<string, ChannelLeafState>,
  model: CollapseModel,
): VirtualRow[] {
  const rows: VirtualRow[] = []

  for (const summary of summaries) {
    const ch = summary.chanFolderName
    rows.push({ kind: 'channel-header', channel: ch, count: summary.count })

    if (isCollapsed(model, `ch::${ch}`)) continue

    const leafState = channelLeaves.get(ch) ?? { status: 'unloaded' }
    if (leafState.status === 'loading' || leafState.status === 'unloaded') {
      rows.push({ kind: 'loading-sentinel', channel: ch })
      continue
    }

    // Loaded — generate year groups
    const items = leafState.items
    let curYr = ''
    for (const item of items) {
      const yr = getYear(item)
      if (yr !== curYr) {
        curYr = yr
        const count = items.filter((i) => getYear(i) === yr).length
        rows.push({ kind: 'year-header', channel: ch, year: yr, count })
      }
      if (!isCollapsed(model, `yr::${ch}::${yr}`)) {
        rows.push({ kind: 'folder-item', item })
      }
    }
    // Empty channel (all filtered out by search etc.)
    if (items.length === 0) {
      // Don't add anything — the header with count=0 is enough context
    }
  }

  return rows
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ArchiveWorkspaceClient({
  initialPage,
  initialTab,
  initialIsVideo,
  initialHasSuggestion,
  highlightId,
  initialChannelSummaries,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [counts, setCounts] = useState<WorkspaceCounts>(initialPage.counts)

  // ── Flat-list state (non-tree groupBy modes + phantom/untracked tabs) ────────
  const [folderItems, setFolderItems] = useState<ArchiveFolderEntry[]>(
    (initialTab === 'orphan' || initialTab === 'linked')
      ? (initialPage.items as ArchiveFolderEntry[])
      : [],
  )
  const [flatItems, setFlatItems] = useState<(PhantomEntry | UntrackedEntry)[]>(
    (initialTab === 'phantom' || initialTab === 'untracked')
      ? (initialPage.items as (PhantomEntry | UntrackedEntry)[])
      : [],
  )
  const [total, setTotal] = useState(initialPage.total)
  const [hasMore, setHasMore] = useState(initialPage.hasMore)
  const [loading, setLoading] = useState(false)

  // ── Tree-mode state (channelYear groupBy for orphan/linked) ──────────────────
  const [channelSummaries, setChannelSummaries] = useState<ChannelSummary[]>(
    initialChannelSummaries ?? [],
  )
  const [channelLeaves, setChannelLeaves] = useState<Map<string, ChannelLeafState>>(new Map())
  const [summariesLoading, setSummariesLoading] = useState(false)

  // Filter state
  const [groupBy, setGroupByState] = useState<GroupBy>('channelYear')
  const [sort, setSortState] = useState<ArchiveSort>('date')
  const [sortDir, setSortDirState] = useState<SortDir>('desc')
  const [isVideo, setIsVideoState] = useState<boolean | undefined>(initialIsVideo)
  const [hasSuggestion, setHasSuggestion] = useState(initialHasSuggestion ?? false)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  // Collapse model — default collapsed (tree-first UX)
  const [collapseModel, setCollapseModel] = useState<CollapseModel>({
    allCollapsed: true,
    exceptions: new Set(),
  })

  // Highlight: transient ring on a specific folder row
  const [activeHighlight, setActiveHighlight] = useState<string | undefined>(highlightId)

  const listRef = useRef<HTMLDivElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Session storage restore ────────────────────────────────────────────────
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      if (saved) {
        const p = JSON.parse(saved) as Partial<{
          groupBy: GroupBy; sort: ArchiveSort; sortDir: SortDir; isVideo: boolean | null
        }>
        if (p.groupBy) setGroupByState(p.groupBy)
        if (p.sort) setSortState(p.sort)
        if (p.sortDir) setSortDirState(p.sortDir)
        if (p.isVideo !== undefined) setIsVideoState(p.isVideo ?? undefined)
      }
      const savedCollapse = sessionStorage.getItem(COLLAPSE_KEY)
      if (savedCollapse) {
        const p = JSON.parse(savedCollapse) as { allCollapsed: boolean; exceptions: string[] }
        setCollapseModel({ allCollapsed: p.allCollapsed, exceptions: new Set(p.exceptions) })
      }
    } catch { /* ignore */ }
    setHydrated(true)
  }, [])

  function persistFilters(patch: Partial<{ groupBy: GroupBy; sort: ArchiveSort; sortDir: SortDir; isVideo: boolean | null }>) {
    try {
      const cur = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '{}')
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...cur, ...patch }))
    } catch { /* ignore */ }
  }

  function persistCollapseModel(model: CollapseModel) {
    try {
      sessionStorage.setItem(COLLAPSE_KEY, JSON.stringify({
        allCollapsed: model.allCollapsed,
        exceptions: Array.from(model.exceptions),
      }))
    } catch { /* ignore */ }
  }

  // ── Mode flags ─────────────────────────────────────────────────────────────
  const isFolderTab = tab === 'orphan' || tab === 'linked'
  const isTreeMode = isFolderTab && groupBy === 'channelYear'

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

  // ── Load channel leaves (tree mode) ────────────────────────────────────────
  const loadChannelLeaves = useCallback((chanFolderName: string) => {
    setChannelLeaves((prev) => {
      const existing = prev.get(chanFolderName)
      if (existing && existing.status !== 'unloaded') return prev  // already loading/loaded
      const next = new Map(prev)
      next.set(chanFolderName, { status: 'loading' })
      return next
    })

    getArchiveItemsAction({
      tab: tab as 'orphan' | 'linked',
      isVideo,
      hasSuggestion: hasSuggestion || undefined,
      search: search || undefined,
      groupBy: 'channelYear',
      chanFolderName,
    }).then((page) => {
      setChannelLeaves((prev) => {
        const next = new Map(prev)
        next.set(chanFolderName, { status: 'loaded', items: page.items as ArchiveFolderEntry[] })
        return next
      })
    }).catch(() => {
      setChannelLeaves((prev) => {
        const next = new Map(prev)
        next.set(chanFolderName, { status: 'unloaded' })
        return next
      })
    })
  }, [tab, isVideo, hasSuggestion, search])

  // ── Data fetching ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return
    let cancelled = false

    if (isTreeMode) {
      // Tree mode: fetch channel summaries; reset leaves
      setSummariesLoading(true)
      setChannelLeaves(new Map())
      getArchiveChannelSummariesAction(tab as 'orphan' | 'linked', {
        isVideo,
        hasSuggestion: hasSuggestion || undefined,
        search: search || undefined,
      }).then((data) => {
        if (cancelled) return
        setChannelSummaries(data.summaries)
        setCounts(data.counts)
        setSummariesLoading(false)
      }).catch(() => { if (!cancelled) setSummariesLoading(false) })
    } else {
      // Flat mode: existing offset-based fetch
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
      }).catch(() => { if (!cancelled) setLoading(false) })
    }

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
    if (isTreeMode) {
      return buildVirtualRowsTree(channelSummaries, channelLeaves, collapseModel)
    }
    if (isFolderTab) {
      return buildVirtualRowsFlat(folderItems, groupBy, collapseModel, hasMore)
    }
    const rows: VirtualRow[] = flatItems.map((item) => ({
      kind: 'flat-item' as const,
      item,
      itemType: (tab === 'phantom' ? 'phantom' : 'untracked') as 'phantom' | 'untracked',
    }))
    if (hasMore) rows.push({ kind: 'loading-sentinel' })
    return rows
  }, [isTreeMode, isFolderTab, channelSummaries, channelLeaves, folderItems, flatItems, groupBy, collapseModel, hasMore, tab])

  // ── Window virtualizer ─────────────────────────────────────────────────────
  const virtualizer = useWindowVirtualizer({
    count: virtualRows.length,
    estimateSize: (i) => {
      const row = virtualRows[i]
      if (!row) return ORPHAN_H
      if (row.kind === 'channel-header') return CHANNEL_H
      if (row.kind === 'year-header') return YEAR_H
      if (row.kind === 'loading-sentinel') return SENTINEL_H
      if (row.kind === 'flat-item') return FLAT_ITEM_H
      if (row.kind === 'folder-item') {
        if (tab === 'linked') return LINKED_H
        if (tab === 'orphan') {
          const hasSug = !!(row.item.suggestedSetId || row.item.suggestedStagingId)
          return hasSug ? ORPHAN_SUG_H : ORPHAN_H
        }
      }
      return ORPHAN_H
    },
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 10,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  })

  // ── Highlight: scroll to item on first render ──────────────────────────────
  const highlightScrolled = useRef(false)
  useEffect(() => {
    if (!activeHighlight || highlightScrolled.current || loading) return
    const idx = virtualRows.findIndex(
      (r) => r.kind === 'folder-item' && r.item.id === activeHighlight,
    )
    if (idx === -1) return
    highlightScrolled.current = true
    virtualizer.scrollToIndex(idx, { align: 'center' })
    const t = setTimeout(() => setActiveHighlight(undefined), 2500)
    return () => clearTimeout(t)
  }, [activeHighlight, virtualRows, virtualizer, loading])

  // ── Infinite scroll trigger (flat mode only) ───────────────────────────────
  const vItems = virtualizer.getVirtualItems()
  useEffect(() => {
    if (isTreeMode) return  // tree mode: lazy load per channel instead
    if (!vItems.length || !hasMore || loading) return
    const last = vItems[vItems.length - 1]
    if (last && last.index >= virtualRows.length - 6) {
      loadMore()
    }
  }, [vItems, hasMore, loading, virtualRows.length, loadMore, isTreeMode])

  // ── Tab switch ─────────────────────────────────────────────────────────────
  function switchTab(t: Tab) {
    setTab(t)
    setFolderItems([])
    setFlatItems([])
    setChannelSummaries([])
    setChannelLeaves(new Map())
    setHasMore(false)
    setSearch('')
    setSearchInput('')
  }

  // ── Filter helpers ─────────────────────────────────────────────────────────
  function setGroupBy(v: GroupBy) { setGroupByState(v); persistFilters({ groupBy: v }) }
  function setSort(v: ArchiveSort) { setSortState(v); persistFilters({ sort: v }) }
  function toggleSortDir() {
    const next: SortDir = sortDir === 'desc' ? 'asc' : 'desc'
    setSortDirState(next); persistFilters({ sortDir: next })
  }
  function setIsVideo(v: boolean | undefined) { setIsVideoState(v); persistFilters({ isVideo: v ?? null }) }

  // ── Search debounce ────────────────────────────────────────────────────────
  function handleSearchChange(val: string) {
    setSearchInput(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearch(val), 300)
  }

  // ── Collapse helpers (inverted model) ──────────────────────────────────────
  function toggleCollapse(key: string) {
    setCollapseModel((prev) => {
      const next = { allCollapsed: prev.allCollapsed, exceptions: new Set(prev.exceptions) }
      const wasCollapsed = isCollapsed(prev, key)
      if (next.exceptions.has(key)) next.exceptions.delete(key)
      else next.exceptions.add(key)
      persistCollapseModel(next)

      // In tree mode, trigger lazy load when expanding a channel
      if (isTreeMode && wasCollapsed && key.startsWith('ch::')) {
        const chanFolderName = key.slice(4)
        const leafState = channelLeaves.get(chanFolderName)
        if (!leafState || leafState.status === 'unloaded') {
          // Trigger load after state update settles
          setTimeout(() => loadChannelLeaves(chanFolderName), 0)
        }
      }

      return next
    })
  }

  function collapseAll() {
    const next: CollapseModel = { allCollapsed: true, exceptions: new Set() }
    setCollapseModel(next)
    persistCollapseModel(next)
  }

  function expandAll() {
    const next: CollapseModel = { allCollapsed: false, exceptions: new Set() }
    setCollapseModel(next)
    persistCollapseModel(next)
    // In tree mode, trigger lazy load for all channels not yet loaded
    if (isTreeMode) {
      for (const summary of channelSummaries) {
        const leafState = channelLeaves.get(summary.chanFolderName)
        if (!leafState || leafState.status === 'unloaded') {
          loadChannelLeaves(summary.chanFolderName)
        }
      }
    }
  }

  // ── Re-parse folder names ──────────────────────────────────────────────────
  const [reparsing, setReparsing] = useState(false)
  const [reparseMsg, setReparseMsg] = useState<string | null>(null)

  async function handleReparse() {
    setReparsing(true)
    setReparseMsg(null)
    const result = await reparseFolderNamesAction()
    setReparsing(false)
    if (result.success) {
      setReparseMsg(`Re-parsed ${result.updated} folders`)
      if (isTreeMode) {
        // Reload summaries + clear leaves
        getArchiveChannelSummariesAction(tab as 'orphan' | 'linked', {
          isVideo, hasSuggestion: hasSuggestion || undefined, search: search || undefined,
        }).then((data) => {
          setChannelSummaries(data.summaries)
          setCounts(data.counts)
          setChannelLeaves(new Map())
        })
      } else {
        getArchiveItemsAction(buildFilters(0)).then((page) => {
          setCounts(page.counts)
          setTotal(page.total)
          setHasMore(page.hasMore)
          if (isFolderTab) {
            setFolderItems(page.items as ArchiveFolderEntry[])
          } else {
            setFlatItems(page.items as (PhantomEntry | UntrackedEntry)[])
          }
        })
      }
    } else {
      setReparseMsg('Re-parse failed')
    }
    setTimeout(() => setReparseMsg(null), 4000)
  }

  // ── Summary total for tree mode ────────────────────────────────────────────
  const treeTotal = useMemo(
    () => channelSummaries.reduce((sum, s) => sum + s.count, 0),
    [channelSummaries],
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  const isFolderTabBool = tab === 'orphan' || tab === 'linked'
  const showGroupControls = isFolderTabBool
  const displayTotal = isTreeMode ? treeTotal : total
  const isAnyLoading = isTreeMode ? summariesLoading : loading

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <FolderSearch size={20} className="text-muted-foreground" />
        <h1 className="text-2xl font-bold">Archive</h1>
        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
          {displayTotal.toLocaleString()} total
        </span>
      </div>

      <div className="rounded-2xl border border-white/30 bg-card/70 shadow-lg backdrop-blur-md dark:border-white/10">
        {/* Sticky header: tabs + filter bar */}
        <div className="sticky top-0 z-20 rounded-t-2xl bg-card/95 backdrop-blur-sm">
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
                    onClick={() => setIsVideo(mode === 'all' ? undefined : mode === 'video')}
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

            {/* Row 2: groupBy + sort + collapse */}
            {showGroupControls && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2.5 py-0.5">
                  <span className="text-[10px] text-muted-foreground">Group:</span>
                  <select
                    value={groupBy}
                    onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                    className="bg-transparent text-xs text-foreground outline-none cursor-pointer"
                  >
                    {(Object.keys(GROUP_BY_LABELS) as GroupBy[]).map((k) => (
                      <option key={k} value={k}>{GROUP_BY_LABELS[k]}</option>
                    ))}
                  </select>
                </div>

                {groupBy === 'none' && (
                  <>
                    <div className="flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2.5 py-0.5">
                      <span className="text-[10px] text-muted-foreground">Sort:</span>
                      <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as ArchiveSort)}
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

                {groupBy !== 'none' && (
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={collapseAll}
                      className="flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronsDownUp size={11} />
                      Collapse all
                    </button>
                    <button
                      onClick={expandAll}
                      className="flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronsUpDown size={11} />
                      Expand all
                    </button>
                  </div>
                )}

                {/* Re-parse button — fixes Unknown/Undated groups from legacy folder names */}
                {isFolderTabBool && (
                  <div className="ml-auto flex items-center gap-2">
                    {reparseMsg && (
                      <span className="text-[10px] text-muted-foreground">{reparseMsg}</span>
                    )}
                    <button
                      onClick={handleReparse}
                      disabled={reparsing}
                      title="Re-parse all folder names in the DB — fixes Unknown/Undated groups without requiring a rescan"
                      className="flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                    >
                      <RefreshCw size={11} className={cn(reparsing && 'animate-spin')} />
                      Re-parse names
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Virtualized list */}
        <div ref={listRef} className="px-3 py-2">
          {virtualRows.length === 0 && !isAnyLoading ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <FolderSearch size={32} className="opacity-20" />
              <p className="text-sm">{TAB_CONFIG[tab].emptyMsg}</p>
            </div>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((vItem) => {
                const row = virtualRows[vItem.index]
                if (!row) return null
                return (
                  <div
                    key={vItem.key}
                    data-index={vItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vItem.start - virtualizer.options.scrollMargin}px)`,
                    }}
                  >
                    {row.kind === 'channel-header' && (
                      <ArchiveChannelHeader
                        channel={row.channel}
                        count={row.count}
                        collapsed={isCollapsed(collapseModel, `ch::${row.channel}`)}
                        onToggle={() => toggleCollapse(`ch::${row.channel}`)}
                      />
                    )}
                    {row.kind === 'year-header' && (
                      <ArchiveYearSubheader
                        year={row.year}
                        count={row.count}
                        collapsed={isCollapsed(collapseModel, `yr::${row.channel}::${row.year}`)}
                        onToggle={() => toggleCollapse(`yr::${row.channel}::${row.year}`)}
                      />
                    )}
                    {row.kind === 'folder-item' && tab === 'orphan' && (
                      <div className={cn(
                        'py-0.5 rounded-xl transition-all duration-500',
                        activeHighlight === row.item.id && 'ring-2 ring-amber-400 ring-offset-1',
                      )}>
                        <ArchiveOrphanRow item={row.item} />
                      </div>
                    )}
                    {row.kind === 'folder-item' && tab === 'linked' && (
                      <div className={cn(
                        'py-0.5 rounded-xl transition-all duration-500',
                        activeHighlight === row.item.id && 'ring-2 ring-amber-400 ring-offset-1',
                      )}>
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
                        {(isTreeMode ? channelLeaves.get(row.channel ?? '') : loading)
                          ? 'Loading…' : ''}
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
          {isAnyLoading && (isTreeMode ? channelSummaries.length === 0 : folderItems.length === 0 && flatItems.length === 0)
            ? 'Loading…'
            : isTreeMode
              ? `${channelSummaries.length.toLocaleString()} channel${channelSummaries.length !== 1 ? 's' : ''} · ${treeTotal.toLocaleString()} total`
              : `${(isFolderTab ? folderItems : flatItems).length.toLocaleString()} of ${total.toLocaleString()} loaded`
          }
        </div>
      </div>
    </div>
  )
}
