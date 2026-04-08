'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatRelativeTime } from '@/lib/utils'
import { Trash2, ChevronRight, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteImportBatchAction } from '@/lib/actions/import-actions'
import { ImportStatusBadge } from './import-status-badge'
import type { ImportBatchSummary } from '@/lib/services/import/staging-service'

type ImportBatchListProps = {
  batches: ImportBatchSummary[]
}

export function ImportBatchList({ batches }: ImportBatchListProps) {
  const router = useRouter()

  if (batches.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/50 p-8 text-center">
        <FileText size={32} className="mx-auto mb-3 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          No import batches yet. Upload a person data file to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {batches.map((batch) => {
        const imported = batch.itemCounts.IMPORTED || 0
        const skipped = batch.itemCounts.SKIPPED || 0
        const total = batch.totalItems
        const processed = imported + skipped
        const ready = (batch.itemCounts.NEW || 0) + (batch.itemCounts.MATCHED || 0) + (batch.itemCounts.PROBABLE || 0)

        // Derive a human-readable status
        let statusLabel: string
        let statusBadge: string
        if (batch.status === 'COMPLETED' || processed === total) {
          statusLabel = 'Completed'
          statusBadge = 'IMPORTED'
        } else if (batch.status === 'FAILED') {
          statusLabel = 'Failed'
          statusBadge = 'FAILED'
        } else if (imported > 0) {
          statusLabel = `${imported} of ${total} imported`
          statusBadge = 'PARTIAL'
        } else if (ready > 0) {
          statusLabel = 'Ready to review'
          statusBadge = 'NEW'
        } else {
          statusLabel = 'Ready to review'
          statusBadge = 'NEW'
        }

        return (
          <Link
            key={batch.id}
            href={`/import/${batch.id}`}
            className="group flex items-center gap-4 rounded-xl border border-border/50 bg-card/50 p-4 transition-colors hover:bg-card/80"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <FileText size={20} className="text-muted-foreground" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">
                  {batch.subjectName}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  ({batch.subjectIcgId})
                </span>
                <ImportStatusBadge status={statusBadge} />
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{statusLabel}</span>
                {batch.extractionDate && (
                  <span>
                    Extracted {batch.extractionDate.toLocaleDateString()}
                  </span>
                )}
                <span>{formatRelativeTime(batch.createdAt)}</span>
              </div>
              {/* Progress bar for partially imported batches */}
              {imported > 0 && processed < total && (
                <div className="mt-1.5 h-1 w-full max-w-48 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.round((processed / total) * 100)}%` }}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={async (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (confirm(`Delete batch for ${batch.subjectName}?`)) {
                    await deleteImportBatchAction(batch.id)
                    router.refresh()
                  }
                }}
              >
                <Trash2 size={14} className="text-destructive" />
              </Button>
              <ChevronRight
                size={16}
                className="text-muted-foreground/50 transition-colors group-hover:text-foreground"
              />
            </div>
          </Link>
        )
      })}
    </div>
  )
}
