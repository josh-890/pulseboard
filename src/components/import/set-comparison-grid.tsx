'use client'

import { cn } from '@/lib/utils'
import { Check, Plus, ArrowRight } from 'lucide-react'
import type { StagingSetComparison } from '@/lib/services/import/staging-set-service'

type SetComparisonGridProps = {
  comparison: StagingSetComparison
}

function FieldRow({
  label,
  existingValue,
  importedValue,
  highlight,
}: {
  label: string
  existingValue: string | null | undefined
  importedValue: string | null | undefined
  highlight?: boolean
}) {
  const existing = existingValue ?? '—'
  const imported = importedValue ?? '—'
  const isDiff = existing !== imported && importedValue != null

  return (
    <div className={cn(
      'grid grid-cols-[120px_1fr_1fr] gap-2 border-b border-border/30 py-1.5',
      highlight && 'bg-emerald-500/5',
    )}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm">{existing}</span>
      <span className={cn('text-sm', isDiff && 'font-medium text-emerald-600 dark:text-emerald-400')}>
        {imported}
      </span>
    </div>
  )
}

export function SetComparisonGrid({ comparison }: SetComparisonGridProps) {
  const { stagingSet, matchedSet, diff } = comparison

  if (!matchedSet) return null

  const importedDate = stagingSet.releaseDate
    ? new Date(stagingSet.releaseDate).toLocaleDateString()
    : null
  const existingDate = matchedSet.releaseDate
    ? new Date(matchedSet.releaseDate).toLocaleDateString()
    : null

  return (
    <div className="space-y-4">
      {/* Column headers */}
      <div className="grid grid-cols-[120px_1fr_1fr] gap-2">
        <span />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Existing in DB
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          Import Data
        </span>
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
        />
        <FieldRow
          label="Description"
          existingValue={matchedSet.description?.slice(0, 80)}
          importedValue={stagingSet.description?.slice(0, 80)}
          highlight={!matchedSet.description && !!stagingSet.description}
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
            <Plus size={12} className="text-emerald-500" />
            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
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
            <div key={name} className="flex items-center gap-2 py-1">
              <Plus size={12} className="text-emerald-500" />
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                {name}
              </span>
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
