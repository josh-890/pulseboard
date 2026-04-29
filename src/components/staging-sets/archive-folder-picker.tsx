'use client'

import { useState, useTransition, useCallback, useEffect, useRef } from 'react'
import { Search, Loader2, FolderOpen, X, AlertTriangle } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { confirmArchiveFolderLinkAction } from '@/lib/actions/archive-actions'

// ─── Types ──────────────────────────────────────────────────────────────────

type FolderResult = {
  id: string
  folderName: string
  fileCount: number | null
  parsedDate: string | null
  fullPath: string
  isVideo: boolean
  parsedShortName: string | null
  chanFolderName: string | null
}

type LinkedFolderResult = FolderResult & {
  currentTargetType: 'stagingSet' | 'set'
  currentTargetTitle: string | null
  currentTargetStatus: string | null
}

type SearchResponse = {
  unlinked: FolderResult[]
  linked: LinkedFolderResult[]
}

type ArchiveFolderPickerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  stagingSetId: string
  /** Pre-seeds the search field with the set title */
  initialQuery?: string
  /** Channel shortName — passed as a separate filter param for better matching */
  shortName?: string
  /** Release year — passed as a separate filter param for better matching */
  year?: number
  /** Called after a folder is successfully linked or re-assigned */
  onSuccess?: () => void
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ArchiveFolderPicker({
  open,
  onOpenChange,
  stagingSetId,
  initialQuery = '',
  shortName,
  year,
  onSuccess,
}: ArchiveFolderPickerProps) {
  const [query, setQuery] = useState(initialQuery)
  const [unlinked, setUnlinked] = useState<FolderResult[]>([])
  const [linked, setLinked] = useState<LinkedFolderResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus input and reset state when sheet opens
  useEffect(() => {
    if (open) {
      setQuery(initialQuery)
      setConfirmingId(null)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, initialQuery])

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '20' })
      if (q.trim()) params.set('q', q.trim())
      if (shortName) params.set('shortName', shortName)
      if (year) params.set('year', String(year))
      const res = await fetch(`/api/archive/folders/search?${params}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json() as SearchResponse
      setUnlinked(data.unlinked)
      setLinked(data.linked)
    } catch {
      setError('Search failed. Please try again.')
      setUnlinked([])
      setLinked([])
    } finally {
      setLoading(false)
    }
  }, [shortName, year])

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void doSearch(query), 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open, doSearch])

  function handleSelect(folder: FolderResult) {
    startTransition(async () => {
      const result = await confirmArchiveFolderLinkAction(folder.id, stagingSetId, 'staging')
      if (result.success) {
        onOpenChange(false)
        onSuccess?.()
      } else {
        setError(result.error ?? 'Failed to link folder')
      }
    })
  }

  function handleReassign(folder: LinkedFolderResult) {
    startTransition(async () => {
      const result = await confirmArchiveFolderLinkAction(folder.id, stagingSetId, 'staging')
      if (result.success) {
        setConfirmingId(null)
        onOpenChange(false)
        onSuccess?.()
      } else {
        setError(result.error ?? 'Failed to re-assign folder')
      }
    })
  }

  const hasAnyResults = unlinked.length > 0 || linked.length > 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[480px] max-w-full flex-col gap-0 p-0 sm:w-[480px]">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-base">Link Archive Folder</SheetTitle>
        </SheetHeader>

        {/* Search input */}
        <div className="border-b px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by folder name, title, or date…"
              className="w-full rounded-md border bg-background py-2 pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching…
            </div>
          )}

          {!loading && error && (
            <p className="px-4 py-6 text-center text-sm text-destructive">{error}</p>
          )}

          {!loading && !error && !hasAnyResults && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No folders found.
            </p>
          )}

          {!loading && !error && hasAnyResults && (
            <>
              {/* ── Unlinked folders ── */}
              {unlinked.length > 0 && (
                <>
                  {linked.length > 0 && (
                    <p className="px-4 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Available to link
                    </p>
                  )}
                  <ul className="divide-y">
                    {unlinked.map((folder) => (
                      <li key={folder.id}>
                        <button
                          type="button"
                          onClick={() => handleSelect(folder)}
                          disabled={isPending}
                          className={cn(
                            'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                            'hover:bg-muted/60 disabled:opacity-50',
                          )}
                        >
                          <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{folder.folderName}</p>
                            <p className="truncate text-xs text-muted-foreground">{folder.fullPath}</p>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                              {folder.fileCount != null && (
                                <span>{folder.fileCount} files</span>
                              )}
                              {folder.parsedDate && (
                                <span>{folder.parsedDate.slice(0, 10)}</span>
                              )}
                              {folder.chanFolderName && (
                                <span className="rounded bg-muted px-1">{folder.chanFolderName}</span>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {/* ── Already linked (re-assign) ── */}
              {linked.length > 0 && (
                <>
                  <p className="px-4 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Already linked — click to re-assign
                  </p>
                  <ul className="divide-y">
                    {linked.map((folder) => {
                      const isConfirming = confirmingId === folder.id
                      return (
                        <li key={folder.id}>
                          <div
                            className={cn(
                              'px-4 py-3 transition-colors',
                              isConfirming ? 'bg-amber-500/10' : 'hover:bg-muted/60',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => setConfirmingId(isConfirming ? null : folder.id)}
                              disabled={isPending}
                              className="flex w-full items-start gap-3 text-left disabled:opacity-50"
                            >
                              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{folder.folderName}</p>
                                <p className="truncate text-xs text-muted-foreground">{folder.fullPath}</p>
                                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                                  {folder.fileCount != null && (
                                    <span>{folder.fileCount} files</span>
                                  )}
                                  {folder.parsedDate && (
                                    <span>{folder.parsedDate.slice(0, 10)}</span>
                                  )}
                                  {folder.chanFolderName && (
                                    <span className="rounded bg-muted px-1">{folder.chanFolderName}</span>
                                  )}
                                </div>
                                {folder.currentTargetTitle && (
                                  <div className="mt-1 flex items-center gap-1 text-xs text-amber-500">
                                    <AlertTriangle className="h-3 w-3 shrink-0" />
                                    <span className="truncate">
                                      Currently: {folder.currentTargetTitle}
                                      {folder.currentTargetStatus && (
                                        <span className="ml-1 text-amber-500/70">· {folder.currentTargetStatus}</span>
                                      )}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </button>

                            {/* Inline confirm/cancel */}
                            {isConfirming && (
                              <div className="mt-2 flex items-center gap-2 pl-7">
                                <button
                                  type="button"
                                  onClick={() => handleReassign(folder)}
                                  disabled={isPending}
                                  className="rounded bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                                >
                                  Re-assign to this set
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingId(null)}
                                  disabled={isPending}
                                  className="rounded px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer: pending state */}
        {isPending && (
          <div className="flex items-center justify-center gap-2 border-t py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Linking folder…
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
