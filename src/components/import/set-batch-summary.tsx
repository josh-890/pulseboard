'use client'

import { useMemo, useState, useEffect } from 'react'
import { ImageIcon, ExternalLink, Layers, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { ImportBatch, ImportItem } from '@/generated/prisma/client'

type ImportBatchWithItems = ImportBatch & { items: ImportItem[] }

type SetBatchSummaryProps = {
  batch: ImportBatchWithItems
}

type StagingStats = {
  total: number
  byStatus: Record<string, number>
  byMatchType: { none: number; exact: number; probable: number }
}

export function SetBatchSummary({ batch }: SetBatchSummaryProps) {
  const [stats, setStats] = useState<StagingStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Count SET items from the import batch
  const setItemCount = useMemo(
    () => batch.items.filter((i) => i.type === 'SET').length,
    [batch.items],
  )

  // Fetch global staging set stats (all batches)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const r = await fetch('/api/staging-sets/stats')
        const data: StagingStats = await r.json()
        if (!cancelled) setStats(data)
      } catch {
        // Stats not available yet
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Parse the stored summary if available
  const summary = batch.stagingSummary as {
    created: number
    skipped: number
    duplicated: number
    byMatchType: { none: number; exact: number; probable: number }
  } | null

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md space-y-4">
        {/* Main summary card */}
        <div className="rounded-lg border border-border/50 bg-card/50 p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <ImageIcon size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                {setItemCount} sets parsed
              </h2>
              <p className="text-xs text-muted-foreground">
                Added to the staging list
              </p>
            </div>
          </div>

          {/* Stats breakdown */}
          {isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              Loading staging stats...
            </div>
          ) : stats ? (
            <div className="space-y-2">
              {/* Match type breakdown */}
              <div className="space-y-1.5">
                {stats.byMatchType.none > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className={cn('inline-block h-2 w-2 rounded-full bg-blue-500')} />
                    <span className="text-muted-foreground">{stats.byMatchType.none} no match found</span>
                  </div>
                )}
                {stats.byMatchType.exact > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className={cn('inline-block h-2 w-2 rounded-full bg-purple-500')} />
                    <span className="text-muted-foreground">{stats.byMatchType.exact} matched to existing sets</span>
                  </div>
                )}
                {stats.byMatchType.probable > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className={cn('inline-block h-2 w-2 rounded-full bg-amber-500')} />
                    <span className="text-muted-foreground">{stats.byMatchType.probable} probable matches</span>
                  </div>
                )}
              </div>

              {/* Status breakdown */}
              {(stats.byStatus.PROMOTED > 0 || stats.byStatus.INACTIVE > 0 || stats.byStatus.SKIPPED > 0) && (
                <div className="mt-3 border-t border-border/30 pt-2 space-y-1.5">
                  {stats.byStatus.PROMOTED > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className={cn('inline-block h-2 w-2 rounded-full bg-emerald-500')} />
                      <span className="text-muted-foreground">{stats.byStatus.PROMOTED} promoted to production</span>
                    </div>
                  )}
                  {stats.byStatus.INACTIVE > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className={cn('inline-block h-2 w-2 rounded-full bg-gray-400')} />
                      <span className="text-muted-foreground">{stats.byStatus.INACTIVE} inactive</span>
                    </div>
                  )}
                  {stats.byStatus.SKIPPED > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className={cn('inline-block h-2 w-2 rounded-full bg-gray-400')} />
                      <span className="text-muted-foreground">{stats.byStatus.SKIPPED} skipped</span>
                    </div>
                  )}
                </div>
              )}

              {/* Duplicate / omitted info */}
              {summary && (summary.duplicated > 0 || summary.skipped > 0) && (
                <div className="mt-2 space-y-1">
                  {summary.duplicated > 0 && (
                    <p className="text-xs text-orange-400">
                      {summary.duplicated} already in staging (marked as duplicates)
                    </p>
                  )}
                  {summary.skipped > 0 && (
                    <p className="text-xs text-muted-foreground italic">
                      {summary.skipped} exact matches omitted (already in production)
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {setItemCount} sets parsed from this import file
            </p>
          )}
        </div>

        {/* Link to staging workspace */}
        <Link href="/staging-sets">
          <Button variant="outline" className="w-full gap-2">
            <Layers size={16} />
            Open Staging List
            <ExternalLink size={12} className="ml-auto text-muted-foreground" />
          </Button>
        </Link>
        <p className="text-center text-xs text-muted-foreground">
          <Link href={`/staging-sets?batchId=${batch.id}`} className="underline underline-offset-2 hover:text-foreground">
            View this batch only →
          </Link>
        </p>
      </div>
    </div>
  )
}
