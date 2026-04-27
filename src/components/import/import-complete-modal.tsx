'use client'

import { CheckCircle2, SkipForward, CalendarClock, CalendarOff, ArrowRight, FolderOpen } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { StagingIngestSummary } from '@/lib/services/import/staging-service'

type ImportCompleteModalProps = {
  batchId: string
  subjectName: string
  summary: StagingIngestSummary
  onClose: () => void
}

export function ImportCompleteModal({
  batchId,
  subjectName,
  summary,
  onClose,
}: ImportCompleteModalProps) {
  const router = useRouter()

  const goToStaging = () => {
    onClose()
    router.push('/staging-sets')
  }

  const goToBatch = () => {
    onClose()
    router.push(`/import/${batchId}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="border-b border-white/10 px-6 py-4">
          <p className="text-sm font-semibold text-white">Import complete</p>
          <p className="mt-0.5 text-xs text-zinc-400">{subjectName}</p>
        </div>

        {/* Counts */}
        <div className="space-y-1 px-6 py-4">
          <Row
            icon={<CheckCircle2 size={14} className="text-emerald-400" />}
            count={summary.created}
            label="new sets added to staging"
            countColor="text-emerald-400"
          />
          <Row
            icon={<SkipForward size={14} className="text-zinc-500" />}
            count={summary.skipped}
            label="already known — skipped"
            countColor="text-zinc-400"
          />
          {summary.suggestedDate > 0 && (
            <Row
              icon={<CalendarClock size={14} className="text-amber-400" />}
              count={summary.suggestedDate}
              label="date suggested from title"
              countColor="text-amber-400"
            />
          )}
          {summary.noDate > 0 && (
            <Row
              icon={<CalendarOff size={14} className="text-red-400" />}
              count={summary.noDate}
              label="no date — review later"
              countColor="text-red-400"
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-white/10 px-6 py-4">
          <button
            onClick={goToBatch}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 transition-colors hover:bg-white/5"
          >
            <FolderOpen size={12} />
            View batch
          </button>
          <button
            onClick={goToStaging}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Go to staging
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

type RowProps = {
  icon: React.ReactNode
  count: number
  label: string
  countColor: string
}

function Row({ icon, count, label, countColor }: RowProps) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      {icon}
      <span className={`w-6 text-right text-sm font-semibold tabular-nums ${countColor}`}>
        {count}
      </span>
      <span className="text-xs text-zinc-400">{label}</span>
    </div>
  )
}
