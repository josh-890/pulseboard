'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Trash2,
  ChevronRight,
  ChevronDown,
  FileText,
  Layers,
  Users,
  Loader2,
  Inbox,
  History,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatRelativeTime } from '@/lib/utils'
import { ImportStatusBadge } from './import-status-badge'
import {
  deleteImportBatchAction,
  loadMoreImportInboxAction,
} from '@/lib/actions/import-actions'
import type {
  ImportInboxGroup,
  ImportBatchSummary,
  ImportDoneSort,
} from '@/lib/services/import/staging-service'

type ImportInboxWorkspaceProps = {
  needsReview: ImportInboxGroup[]
  done: ImportInboxGroup[]
  doneNextOffset: number | null
  q?: string
  sort: ImportDoneSort
}

export function ImportInboxWorkspace({
  needsReview,
  done,
  doneNextOffset,
  q,
  sort,
}: ImportInboxWorkspaceProps) {
  const [doneRows, setDoneRows] = useState<ImportInboxGroup[]>(done)
  const [nextOffset, setNextOffset] = useState<number | null>(doneNextOffset)
  const [isLoading, startLoad] = useTransition()
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Re-seed when the server re-renders (e.g. router.refresh after delete):
  // collapse back to the fresh first page. (Search/sort changes remount via key.)
  useEffect(() => { setDoneRows(done) }, [done])
  useEffect(() => { setNextOffset(doneNextOffset) }, [doneNextOffset])

  const loadMore = useCallback(() => {
    if (nextOffset == null || isLoading) return
    startLoad(async () => {
      const res = await loadMoreImportInboxAction({ q, sort, offset: nextOffset })
      setDoneRows((prev) => [...prev, ...res.rows])
      setNextOffset(res.nextOffset)
    })
  }, [nextOffset, isLoading, q, sort])

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  const loadMoreRef = useRef(loadMore)
  useEffect(() => { loadMoreRef.current = loadMore })
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMoreRef.current()
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  if (needsReview.length === 0 && doneRows.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/50 p-8 text-center">
        <FileText size={32} className="mx-auto mb-3 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          {q
            ? 'No imports match your search.'
            : 'No import batches yet. Upload a person data file to get started.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {needsReview.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Inbox size={13} className="text-amber-500" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Needs review
            </h2>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 tabular-nums dark:text-amber-400">
              {needsReview.length}
            </span>
          </div>
          <ul className="space-y-2">
            {needsReview.map((g) => (
              <ImportBatchRow key={g.key} group={g} />
            ))}
          </ul>
        </section>
      )}

      {(doneRows.length > 0 || needsReview.length > 0) && (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Done
          </h2>
          {doneRows.length === 0 ? (
            <p className="px-1 text-xs text-muted-foreground/60 italic">
              Nothing completed yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {doneRows.map((g) => (
                <ImportBatchRow key={g.key} group={g} />
              ))}
            </ul>
          )}
          {nextOffset != null && (
            <div ref={sentinelRef} className="flex justify-center py-3">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={loadMore}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                Load more
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

// ─── Row ────────────────────────────────────────────────────────────────────

function ImportBatchRow({ group }: { group: ImportInboxGroup }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [isDeleting, startDelete] = useTransition()
  const { latest } = group

  function statusLabel(b: ImportBatchSummary): string {
    switch (b.state) {
      case 'DONE':
        return b.reviewableTotal > 0 ? 'Imported' : 'Nothing to review'
      case 'NEEDS_REVIEW':
        return `${b.reviewablePending} to review`
      case 'BLOCKED':
        return `${b.blocked} blocked`
      case 'FAILED':
        return 'Failed'
    }
  }

  function handleDelete() {
    if (!confirm(`Delete the latest import for ${group.subjectName}?`)) return
    startDelete(async () => {
      await deleteImportBatchAction(latest.id)
      router.refresh()
    })
  }

  return (
    <li
      className={cn(
        'rounded-xl border border-border/50 bg-card/50 transition-colors hover:bg-card/80',
        isDeleting && 'pointer-events-none opacity-50',
      )}
    >
      <div className="group flex items-center gap-4 p-4">
        <Link
          href={`/import/${latest.id}`}
          className="flex min-w-0 flex-1 items-center gap-4"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <FileText size={20} className="text-muted-foreground" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{group.subjectName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                ({group.subjectIcgId})
              </span>
              <ImportStatusBadge status={latest.state} />
              {group.version > 1 && (
                <span
                  title={`${group.version} imports for this person`}
                  className="shrink-0 rounded-full border border-white/15 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums"
                >
                  v{group.version}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{statusLabel(latest)}</span>
              {latest.setStagedCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Layers size={11} className="opacity-60" />
                  {latest.setStagedCount} {latest.setStagedCount === 1 ? 'set' : 'sets'} staged
                </span>
              )}
              {latest.coModelCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Users size={11} className="opacity-60" />
                  {latest.coModelCount} co-{latest.coModelCount === 1 ? 'model' : 'models'}
                </span>
              )}
              {latest.extractionDate && (
                <span>Extracted {latest.extractionDate.toLocaleDateString()}</span>
              )}
              <span>{formatRelativeTime(latest.createdAt)}</span>
            </div>
          </div>
        </Link>

        <div className="flex shrink-0 items-center gap-1">
          {group.version > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label={expanded ? 'Hide earlier imports' : 'Show earlier imports'}
              aria-expanded={expanded}
              onClick={() => setExpanded((e) => !e)}
            >
              <ChevronDown
                size={15}
                className={cn('transition-transform', expanded && 'rotate-180')}
              />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Delete latest import"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 size={14} className="text-destructive" />
          </Button>
          <ChevronRight size={16} className="text-muted-foreground/50" />
        </div>
      </div>

      {/* Earlier imports (re-import chain) */}
      {expanded && group.history.length > 0 && (
        <ul className="border-t border-white/10 px-4 py-2">
          <li className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            <History size={11} />
            Earlier imports
          </li>
          {group.history.map((b) => (
            <li key={b.id}>
              <Link
                href={`/import/${b.id}`}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-muted/40"
              >
                <ImportStatusBadge status={b.state} showLabel={false} />
                <span className="text-muted-foreground">
                  {b.extractionDate
                    ? b.extractionDate.toLocaleDateString()
                    : formatRelativeTime(b.createdAt)}
                </span>
                <span className="truncate text-muted-foreground/70">{b.filename}</span>
                <ChevronRight size={13} className="ml-auto text-muted-foreground/40" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
