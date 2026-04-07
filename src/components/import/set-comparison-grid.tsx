'use client'

import { cn } from '@/lib/utils'
import { Check, Plus, ArrowRight, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { StagingSetComparison } from '@/lib/services/import/staging-set-service'

type SetComparisonGridProps = {
  comparison: StagingSetComparison
  onConfirmMatch?: () => void
  onClearMatch?: () => void
  onApplyField?: (field: string) => Promise<void>
}

function FieldRow({
  label,
  existingValue,
  importedValue,
  highlight,
  isSame,
  onApply,
  applyingField,
}: {
  label: string
  existingValue: string | null | undefined
  importedValue: string | null | undefined
  highlight?: boolean
  /** Override: treat values as matching even if strings differ (e.g. resolved channel) */
  isSame?: boolean
  onApply?: () => void
  applyingField?: boolean
}) {
  const existing = existingValue ?? '\u2014'
  const imported = importedValue ?? '\u2014'
  const isDiff = !isSame && existing !== imported && importedValue != null

  return (
    <div className={cn(
      'grid grid-cols-[120px_1fr_1fr_24px] gap-2 border-b border-border/30 py-1.5',
      highlight && 'bg-blue-500/5',
    )}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm">{existing}</span>
      <span className={cn('text-sm', isDiff && 'font-medium text-amber-600 dark:text-amber-400')}>
        {imported}
      </span>
      <span className="flex items-center justify-center">
        {isDiff && onApply && (
          <button
            onClick={onApply}
            disabled={applyingField}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-blue-500/10 hover:text-blue-600 disabled:opacity-50"
            title="Apply to existing set"
          >
            {applyingField ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
          </button>
        )}
      </span>
    </div>
  )
}

export function SetComparisonGrid({ comparison, onConfirmMatch, onClearMatch, onApplyField }: SetComparisonGridProps) {
  const { stagingSet, matchedSet, diff } = comparison
  const [applyingField, setApplyingField] = useState<string | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [clearLoading, setClearLoading] = useState(false)

  if (!matchedSet) return null

  const importedDate = stagingSet.releaseDate
    ? new Date(stagingSet.releaseDate).toLocaleDateString()
    : null
  const existingDate = matchedSet.releaseDate
    ? new Date(matchedSet.releaseDate).toLocaleDateString()
    : null

  // Channel is the same if the staging set resolved to the same channel as the matched set
  const channelIsSame = !!(
    stagingSet.channelId && matchedSet.channel?.id &&
    stagingSet.channelId === matchedSet.channel.id
  )

  const isConfirmed = stagingSet.matchConfidence === 1.0

  const handleApply = async (field: string) => {
    if (!onApplyField) return
    setApplyingField(field)
    try {
      await onApplyField(field)
    } finally {
      setApplyingField(null)
    }
  }

  const handleConfirm = async () => {
    if (!onConfirmMatch) return
    setConfirmLoading(true)
    try {
      onConfirmMatch()
    } finally {
      setConfirmLoading(false)
    }
  }

  const handleClear = async () => {
    if (!onClearMatch) return
    setClearLoading(true)
    try {
      onClearMatch()
    } finally {
      setClearLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Confirm / Clear match buttons */}
      {(onConfirmMatch || onClearMatch) && (
        <div className="flex items-center gap-2">
          {onConfirmMatch && !isConfirmed && (
            <button
              onClick={handleConfirm}
              disabled={confirmLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-500/20 disabled:opacity-50 dark:text-purple-400"
            >
              {confirmLoading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Confirm Match
            </button>
          )}
          {onClearMatch && (
            <button
              onClick={handleClear}
              disabled={clearLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {clearLoading ? <Loader2 size={12} className="animate-spin" /> : null}
              Wrong Match
            </button>
          )}
        </div>
      )}

      {/* Column headers */}
      <div className="grid grid-cols-[120px_1fr_1fr_24px] gap-2">
        <span />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Existing in DB
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Import Data
        </span>
        <span />
      </div>

      {/* Core fields */}
      <div className="rounded-lg border border-border/50 bg-card/50 p-3">
        <FieldRow
          label="Title"
          existingValue={matchedSet.title}
          importedValue={stagingSet.title}
        />
        <FieldRow
          label="Channel"
          existingValue={matchedSet.channel?.name}
          importedValue={stagingSet.channelName}
          isSame={channelIsSame}
        />
        <FieldRow
          label="External ID"
          existingValue={matchedSet.externalId}
          importedValue={stagingSet.externalId}
          onApply={onApplyField ? () => handleApply('externalId') : undefined}
          applyingField={applyingField === 'externalId'}
        />
        <FieldRow
          label="Date"
          existingValue={existingDate}
          importedValue={importedDate}
        />
        <FieldRow
          label="Type"
          existingValue={matchedSet.type}
          importedValue={stagingSet.isVideo ? 'video' : 'photo'}
        />
        <FieldRow
          label="Images"
          existingValue={matchedSet.imageCount?.toString()}
          importedValue={stagingSet.imageCount?.toString()}
          highlight={matchedSet.imageCount == null && stagingSet.imageCount != null}
          onApply={onApplyField ? () => handleApply('imageCount') : undefined}
          applyingField={applyingField === 'imageCount'}
        />
        <FieldRow
          label="Description"
          existingValue={matchedSet.description?.slice(0, 80)}
          importedValue={stagingSet.description?.slice(0, 80)}
          highlight={!matchedSet.description && !!stagingSet.description}
          onApply={onApplyField ? () => handleApply('description') : undefined}
          applyingField={applyingField === 'description'}
        />
      </div>

      {/* Participants comparison */}
      <div className="rounded-lg border border-border/50 bg-card/50 p-3">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Participants
        </h4>
        {matchedSet.participants.map((p) => (
          <div key={p.personId} className="flex items-center gap-2 py-1">
            <Check size={12} className="text-muted-foreground" />
            <span className="text-sm">{p.name}</span>
            <span className="text-[10px] text-muted-foreground">({p.role})</span>
          </div>
        ))}
        {diff.newParticipants.map((p) => (
          <div key={p.icgId} className="flex items-center gap-2 py-1">
            <Plus size={12} className="text-blue-500" />
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
              {p.name}
            </span>
            <span className="text-[10px] text-muted-foreground">({p.icgId})</span>
          </div>
        ))}
      </div>

      {/* Credits comparison */}
      {(matchedSet.credits.length > 0 || diff.newCredits.length > 0) && (
        <div className="rounded-lg border border-border/50 bg-card/50 p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Credits
          </h4>
          {matchedSet.credits.map((c, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <Check size={12} className="text-muted-foreground" />
              <span className="text-sm">{c.rawName}</span>
            </div>
          ))}
          {diff.newCredits.map((name) => (
            <div key={name} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <Plus size={12} className="text-blue-500" />
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  {name}
                </span>
              </div>
              {onApplyField && (
                <button
                  onClick={() => handleApply('artist')}
                  disabled={applyingField === 'artist'}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-blue-500/10 hover:text-blue-600 disabled:opacity-50"
                  title="Add credit to existing set"
                >
                  {applyingField === 'artist' ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Changes summary */}
      {(diff.newParticipants.length > 0 || diff.newCredits.length > 0 || diff.fieldUpdates.length > 0) && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
          <h4 className="mb-1 text-xs font-semibold text-blue-700 dark:text-blue-400">
            What will change
          </h4>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {diff.newParticipants.map((p) => (
              <li key={p.icgId} className="flex items-center gap-1">
                <ArrowRight size={10} />
                Add {p.name} as participant
              </li>
            ))}
            {diff.newCredits.map((name) => (
              <li key={name} className="flex items-center gap-1">
                <ArrowRight size={10} />
                Add artist credit: {name}
              </li>
            ))}
            {diff.fieldUpdates.map((u) => (
              <li key={u.field} className="flex items-center gap-1">
                <ArrowRight size={10} />
                Fill {u.field}: {String(u.imported)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
