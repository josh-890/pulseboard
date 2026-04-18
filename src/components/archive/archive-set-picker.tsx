'use client'

import { useState, useTransition, useCallback, useEffect, useRef } from 'react'
import { Search, Loader2, X, Layers, BookOpen } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { confirmArchiveFolderLinkAction } from '@/lib/actions/archive-actions'

// ─── Types ──────────────────────────────────────────────────────────────────

type SetResult = {
  id: string
  type: 'set' | 'staging'
  title: string
  releaseDate: string | null
  channelName: string | null
}

type ArchiveSetPickerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  folderId: string
  /** Pre-seeds the search field — typically the folder's parsed title */
  initialQuery?: string
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ArchiveSetPicker({
  open,
  onOpenChange,
  folderId,
  initialQuery = '',
}: ArchiveSetPickerProps) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<SetResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  // Focus input when sheet opens
  useEffect(() => {
    if (open) {
      setQuery(initialQuery)
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
      const res = await fetch(`/api/sets/search?${params}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json() as SetResult[]
      setResults(data)
    } catch {
      setError('Search failed. Please try again.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void doSearch(query), 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open, doSearch])

  function handleSelect(result: SetResult) {
    startTransition(async () => {
      const res = await confirmArchiveFolderLinkAction(folderId, result.id, result.type)
      if (res.success) {
        onOpenChange(false)
        router.refresh()
      } else {
        setError(res.error ?? 'Failed to link')
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[480px] max-w-full flex-col gap-0 p-0 sm:w-[480px]">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-base">Link to Set or Staging Set</SheetTitle>
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
              placeholder="Search by title…"
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
          <p className="mt-1.5 text-xs text-muted-foreground">
            Search promoted sets and staging sets by title.
          </p>
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

          {!loading && !error && results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No sets found.
            </p>
          )}

          {!loading && !error && results.length > 0 && (
            <ul className="divide-y">
              {results.map((result) => (
                <li key={`${result.type}-${result.id}`}>
                  <button
                    type="button"
                    onClick={() => handleSelect(result)}
                    disabled={isPending}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                      'hover:bg-muted/60 disabled:opacity-50',
                    )}
                  >
                    {result.type === 'set'
                      ? <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-blue-500/70" />
                      : <Layers className="mt-0.5 h-4 w-4 shrink-0 text-violet-500/70" />
                    }
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{result.title}</p>
                        <span className={cn(
                          'shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium',
                          result.type === 'set'
                            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                            : 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
                        )}>
                          {result.type === 'set' ? 'set' : 'staging'}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        {result.releaseDate && (
                          <span>{result.releaseDate.slice(0, 10)}</span>
                        )}
                        {result.channelName && (
                          <span className="rounded bg-muted px-1">{result.channelName}</span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer: pending state */}
        {isPending && (
          <div className="flex items-center justify-center gap-2 border-t py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Linking…
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
