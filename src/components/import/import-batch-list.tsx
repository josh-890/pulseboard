'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatRelativeTime } from '@/lib/utils'
import { Trash2, ChevronRight, FileText, Layers, Users } from 'lucide-react'
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
        // Honest status — measured over reviewable items only. Auto-flow sets/
        // co-models/credits are surfaced as informational chips, never as work.
        let statusLabel: string
        switch (batch.state) {
          case 'DONE':
            statusLabel = batch.reviewableTotal > 0 ? 'Imported' : 'Nothing to review'
            break
          case 'NEEDS_REVIEW':
            statusLabel = `${batch.reviewablePending} to review`
            break
          case 'BLOCKED':
            statusLabel = `${batch.blocked} blocked`
            break
          case 'FAILED':
            statusLabel = 'Failed'
            break
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
                <ImportStatusBadge status={batch.state} />
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{statusLabel}</span>
                {/* Auto-flow info chips — informational, never gate completeness */}
                {batch.setStagedCount > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Layers size={11} className="opacity-60" />
                    {batch.setStagedCount} {batch.setStagedCount === 1 ? 'set' : 'sets'} staged
                  </span>
                )}
                {batch.coModelCount > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Users size={11} className="opacity-60" />
                    {batch.coModelCount} co-{batch.coModelCount === 1 ? 'model' : 'models'}
                  </span>
                )}
                {batch.extractionDate && (
                  <span>Extracted {batch.extractionDate.toLocaleDateString()}</span>
                )}
                <span>{formatRelativeTime(batch.createdAt)}</span>
              </div>
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
