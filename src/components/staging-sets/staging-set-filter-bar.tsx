'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, CalendarDays, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ChannelTier, StagingSetStatus } from '@/generated/prisma/client'
import type { StagingSetStats } from '@/lib/services/import/staging-set-service'
import { CHANNEL_TIER_CONFIG, DEFAULT_STAGING_TIERS } from '@/lib/constants/channel-tier'

// ─── Types ─────────────────────────────────────────────────────────────────

export type StagingSetFilterState = {
  status: StagingSetStatus[]
  noDate: boolean
  matchType: 'exact' | 'probable' | 'none' | undefined
  search: string
  channelId: string | undefined
  channelTier: ChannelTier[]
  dateFrom: string | undefined
  dateTo: string | undefined
  priority: number[]
  batchId: string | undefined
  sort: 'date' | 'title' | 'priority' | 'importDate' | 'undatedFirst'
  sortDir: 'asc' | 'desc'
  groupBy: 'none' | 'channel' | 'person' | 'year' | 'status' | 'channelYear'
}

export const DEFAULT_FILTERS: StagingSetFilterState = {
  status: ['PENDING', 'REVIEWING', 'APPROVED'],
  noDate: false,
  matchType: undefined,
  search: '',
  channelId: undefined,
  channelTier: [...DEFAULT_STAGING_TIERS],
  dateFrom: undefined,
  dateTo: undefined,
  priority: [],
  batchId: undefined,
  sort: 'date',
  sortDir: 'asc',
  groupBy: 'none',
}

type StagingSetFilterBarProps = {
  filters: StagingSetFilterState
  onChange: (filters: StagingSetFilterState) => void
  stats: StagingSetStats | null
}

// ─── Constants ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Array<{ value: StagingSetStatus; label: string; dot: string }> = [
  { value: 'PENDING', label: 'Pending', dot: 'bg-blue-500' },
  { value: 'REVIEWING', label: 'Reviewing', dot: 'bg-yellow-500' },
  { value: 'APPROVED', label: 'Approved', dot: 'bg-cyan-500' },
  { value: 'PROMOTED', label: 'Promoted', dot: 'bg-emerald-500' },
  { value: 'INACTIVE', label: 'Inactive', dot: 'bg-gray-400' },
  { value: 'SKIPPED', label: 'Skipped', dot: 'bg-gray-400' },
]

const MATCH_TYPES: Array<{ value: 'exact' | 'probable' | 'none'; label: string }> = [
  { value: 'exact', label: 'Exact match' },
  { value: 'probable', label: 'Probable' },
  { value: 'none', label: 'No match' },
]

const SORT_OPTIONS = [
  { value: 'date', label: 'Date' },
  { value: 'title', label: 'Title' },
  { value: 'priority', label: 'Priority' },
  { value: 'importDate', label: 'Import Date' },
  { value: 'undatedFirst', label: 'Undated First' },
] as const

const GROUP_OPTIONS = [
  { value: 'none', label: 'No grouping' },
  { value: 'channel', label: 'By Channel' },
  { value: 'channelYear', label: 'Channel → Year' },
  { value: 'person', label: 'By Person' },
  { value: 'year', label: 'By Year' },
  { value: 'status', label: 'By Status' },
] as const

// ─── Component ─────────────────────────────────────────────────────────────

export function StagingSetFilterBar({ filters, onChange, stats }: StagingSetFilterBarProps) {
  const [searchInput, setSearchInput] = useState(filters.search)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Debounce search
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (searchInput !== filters.search) {
        onChange({ ...filters, search: searchInput })
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [searchInput]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleStatus = (value: StagingSetStatus) => {
    const next = filters.status.includes(value)
      ? filters.status.filter((s) => s !== value)
      : [...filters.status, value]
    onChange({ ...filters, status: next })
  }

  const toggleMatchType = (value: 'exact' | 'probable' | 'none') => {
    onChange({ ...filters, matchType: filters.matchType === value ? undefined : value })
  }

  const toggleTier = (value: ChannelTier) => {
    const next = filters.channelTier.includes(value)
      ? filters.channelTier.filter((t) => t !== value)
      : [...filters.channelTier, value]
    onChange({ ...filters, channelTier: next })
  }

  const tierDiffersFromDefault =
    filters.channelTier.length !== DEFAULT_STAGING_TIERS.length ||
    !DEFAULT_STAGING_TIERS.every((t) => filters.channelTier.includes(t))

  const hasActiveFilters = filters.search || filters.noDate || filters.matchType ||
    filters.channelId || filters.dateFrom || filters.dateTo || filters.priority.length > 0 ||
    filters.batchId || tierDiffersFromDefault

  return (
    <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border/50 bg-background/95 px-4 py-2.5 backdrop-blur-sm">
      {/* Row 1: Status chips + match chips + no-date + clear */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_CONFIG.map(({ value, label, dot }) => {
          const isActive = filters.status.includes(value)
          const count = stats?.byStatus[value] ?? 0
          return (
            <button
              key={value}
              onClick={() => toggleStatus(value)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                isActive
                  ? 'border-border bg-muted text-foreground'
                  : 'border-slate-200 bg-slate-50 text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:border-border/50 dark:bg-muted/50 dark:hover:border-border dark:hover:bg-muted',
              )}
            >
              <span className={cn('inline-block h-1.5 w-1.5 rounded-full', dot)} />
              {label}
              {count > 0 && <span className="text-[10px] text-muted-foreground">{count}</span>}
            </button>
          )
        })}

        <span className="mx-1 h-4 w-px bg-border/50" />

        {MATCH_TYPES.map(({ value, label }) => {
          const isActive = filters.matchType === value
          return (
            <button
              key={value}
              onClick={() => toggleMatchType(value)}
              className={cn(
                'rounded-full border px-2 py-1 text-xs transition-colors',
                isActive
                  ? 'border-purple-500/50 bg-purple-500/15 text-purple-700 dark:text-purple-400'
                  : 'border-slate-200 bg-slate-50 text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:border-border/50 dark:bg-muted/50 dark:hover:border-border dark:hover:bg-muted',
              )}
            >
              {label}
            </button>
          )
        })}

        <button
          onClick={() => onChange({ ...filters, noDate: !filters.noDate })}
          className={cn(
            'rounded-full border px-2 py-1 text-xs transition-colors',
            filters.noDate
              ? 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-400'
              : 'border-slate-200 bg-slate-50 text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:border-border/50 dark:bg-muted/50 dark:hover:border-border dark:hover:bg-muted',
          )}
        >
          No date
        </button>

        <span className="mx-1 h-4 w-px bg-border/50" />

        {CHANNEL_TIER_CONFIG.map(({ value, letter, dot, border, bg, text }) => {
          const isActive = filters.channelTier.includes(value)
          return (
            <button
              key={value}
              onClick={() => toggleTier(value)}
              className={cn(
                'flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors',
                isActive
                  ? cn(border, bg, text)
                  : 'border-slate-200 bg-slate-50 text-muted-foreground hover:bg-slate-100 hover:text-foreground dark:border-border/50 dark:bg-muted/50 dark:hover:border-border dark:hover:bg-muted',
              )}
            >
              <span className={cn('inline-block h-1.5 w-1.5 rounded-full', dot)} />
              {letter}
            </button>
          )
        })}

        {hasActiveFilters && (
          <button
            onClick={() => {
              setSearchInput('')
              onChange({ ...DEFAULT_FILTERS, status: filters.status })
            }}
            className="ml-1 flex items-center gap-1 rounded-full border border-border/40 bg-muted/30 px-2 py-1 text-xs text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"
          >
            <X size={10} />
            Clear
          </button>
        )}
      </div>

      {/* Row 2: Search + date range + sort + group by */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search title, channel, artist, name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-8 w-52 pl-8 text-xs"
          />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1">
          <CalendarDays size={13} className="text-muted-foreground" />
          <input
            type="date"
            value={filters.dateFrom ?? ''}
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || undefined })}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="date"
            value={filters.dateTo ?? ''}
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value || undefined })}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          />
        </div>

        <span className="ml-auto" />

        {/* Group by */}
        <select
          value={filters.groupBy}
          onChange={(e) => onChange({ ...filters, groupBy: e.target.value as StagingSetFilterState['groupBy'] })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          {GROUP_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={filters.sort}
          onChange={(e) => onChange({ ...filters, sort: e.target.value as StagingSetFilterState['sort'] })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          {SORT_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>Sort: {label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
