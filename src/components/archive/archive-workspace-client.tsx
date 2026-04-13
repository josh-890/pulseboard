'use client'

import { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { FolderSearch, Camera, Film } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ArchiveOrphanRow } from './archive-orphan-row'
import { ArchiveLinkedRow } from './archive-linked-row'
import { ArchivePhantomRow } from './archive-phantom-row'
import { ArchiveUntrackedRow } from './archive-untracked-row'
import type {
  WorkspaceCounts,
  WorkspacePage,
  ArchiveFolderEntry,
  PhantomEntry,
  UntrackedEntry,
} from '@/lib/services/archive-service'

// ─── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'orphan' | 'linked' | 'phantom' | 'untracked'

type Props = {
  initialPage: WorkspacePage
  initialTab: Tab
  initialIsVideo?: boolean
  initialHasSuggestion?: boolean
}

// ─── Tab config ────────────────────────────────────────────────────────────────

const TAB_CONFIG: Record<Tab, { label: string; emptyMsg: string; badge: string }> = {
  orphan:    { label: 'Orphans',   emptyMsg: 'No unmatched folders found.',       badge: 'bg-red-500/20 text-red-600 dark:text-red-400' },
  linked:    { label: 'Linked',    emptyMsg: 'No linked folders yet.',             badge: 'bg-green-500/20 text-green-600 dark:text-green-400' },
  phantom:   { label: 'Phantoms',  emptyMsg: 'No missing archive folders found.', badge: 'bg-amber-500/20 text-amber-600 dark:text-amber-400' },
  untracked: { label: 'Untracked', emptyMsg: 'All records have archive paths.',   badge: 'bg-gray-400/20 text-gray-500 dark:text-gray-400' },
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ArchiveWorkspaceClient({
  initialPage,
  initialTab,
  initialIsVideo,
  initialHasSuggestion,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [counts] = useState<WorkspaceCounts>(initialPage.counts)

  function buildUrl(params: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === '') next.delete(k)
      else next.set(k, v)
    }
    // Always reset cursor when changing filter
    next.delete('cursor')
    return `${pathname}?${next.toString()}`
  }

  function setTab(tab: Tab) {
    router.push(buildUrl({ tab, isVideo: undefined, hasSuggestion: undefined }))
  }

  function setVideoFilter(val: boolean | undefined) {
    router.push(buildUrl({ isVideo: val === undefined ? undefined : String(val) }))
  }

  function setHasSuggestion(val: boolean) {
    router.push(buildUrl({ hasSuggestion: val ? 'true' : undefined }))
  }

  function loadMore(cursor: string) {
    router.push(buildUrl({ cursor }))
  }

  const tab = initialTab
  const config = TAB_CONFIG[tab]

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <FolderSearch size={20} className="text-muted-foreground" />
        <h1 className="text-2xl font-bold">Archive</h1>
        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
          {initialPage.total} in view
        </span>
      </div>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md dark:border-white/10">
        {/* Tab strip */}
        <div className="mb-4 flex flex-wrap gap-2">
          {(Object.keys(TAB_CONFIG) as Tab[]).map((t) => {
            const cfg = TAB_CONFIG[t]
            const count = counts[t]
            const active = tab === t
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
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

        {/* Filter bar — only for orphan and linked tabs */}
        {(tab === 'orphan' || tab === 'linked') && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {/* Photo/Video filter */}
            {(['all', 'photo', 'video'] as const).map((mode) => {
              const active =
                mode === 'all' ? initialIsVideo === undefined
                : mode === 'photo' ? initialIsVideo === false
                : initialIsVideo === true
              return (
                <button
                  key={mode}
                  onClick={() => setVideoFilter(mode === 'all' ? undefined : mode === 'video')}
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

            {/* Has suggestion filter — orphan only */}
            {tab === 'orphan' && (
              <button
                onClick={() => setHasSuggestion(!initialHasSuggestion)}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                  initialHasSuggestion
                    ? 'border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'border-border/50 bg-muted/40 text-muted-foreground hover:bg-muted/60',
                )}
              >
                Has suggestion
              </button>
            )}
          </div>
        )}

        {/* Empty state */}
        {initialPage.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <FolderSearch size={32} className="opacity-20" />
            <p className="text-sm">{config.emptyMsg}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {tab === 'orphan' && (initialPage.items as ArchiveFolderEntry[]).map((item) => (
              <ArchiveOrphanRow key={item.id} item={item} />
            ))}
            {tab === 'linked' && (initialPage.items as ArchiveFolderEntry[]).map((item) => (
              <ArchiveLinkedRow key={item.id} item={item} />
            ))}
            {tab === 'phantom' && (initialPage.items as PhantomEntry[]).map((item) => (
              <ArchivePhantomRow key={`${item.type}-${item.id}`} item={item} />
            ))}
            {tab === 'untracked' && (initialPage.items as UntrackedEntry[]).map((item) => (
              <ArchiveUntrackedRow key={`${item.type}-${item.id}`} item={item} />
            ))}
          </div>
        )}

        {/* Load more */}
        {initialPage.nextCursor && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => loadMore(initialPage.nextCursor!)}
              className="rounded-full border border-border/50 bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
