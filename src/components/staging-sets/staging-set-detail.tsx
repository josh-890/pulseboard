'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Check,
  X,
  Archive,
  Loader2,
  Info,
  AlertTriangle,
  ExternalLink,
  RotateCcw,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { SetComparisonGrid } from '@/components/import/set-comparison-grid'
import type { StagingSetWithRelations, StagingSetComparison } from '@/lib/services/import/staging-set-service'
import type { StagingSetStatus } from '@/generated/prisma/client'
import Link from 'next/link'

// ─── Constants ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-blue-500/10 text-blue-600' },
  REVIEWING: { label: 'Reviewing', className: 'bg-yellow-500/10 text-yellow-600' },
  APPROVED: { label: 'Approved', className: 'bg-cyan-500/10 text-cyan-600' },
  PROMOTED: { label: 'Promoted', className: 'bg-emerald-500/10 text-emerald-600' },
  INACTIVE: { label: 'Inactive', className: 'bg-gray-500/10 text-gray-500' },
  SKIPPED: { label: 'Skipped', className: 'bg-gray-500/10 text-gray-500' },
}

const PRIORITY_OPTIONS = [
  { value: 0, label: 'No priority' },
  { value: 1, label: 'Low' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'High' },
  { value: 4, label: 'Urgent' },
]

// ─── Props ─────────────────────────────────────────────────────────────────

type StagingSetDetailProps = {
  stagingSet: StagingSetWithRelations
  onStatusChange: (id: string, status: StagingSetStatus) => Promise<void>
  onPromote: (id: string) => Promise<void>
  onFieldUpdate: (id: string, fields: Record<string, unknown>) => Promise<void>
  isProcessing: boolean
}

// ─── Component ─────────────────────────────────────────────────────────────

export function StagingSetDetail({
  stagingSet,
  onStatusChange,
  onPromote,
  onFieldUpdate,
  isProcessing,
}: StagingSetDetailProps) {
  const [comparison, setComparison] = useState<StagingSetComparison | null>(null)
  const [isLoadingComparison, setIsLoadingComparison] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editFields, setEditFields] = useState<Record<string, string>>({})

  const hasMatch = !!stagingSet.matchedSetId
  const isExactMatch = hasMatch && stagingSet.matchConfidence === 1.0
  const isActionable = stagingSet.status === 'PENDING' || stagingSet.status === 'REVIEWING' || stagingSet.status === 'APPROVED'

  // Load comparison when matched
  useEffect(() => {
    if (!hasMatch) return
    let cancelled = false
    const load = async () => {
      setIsLoadingComparison(true)
      try {
        const r = await fetch(`/api/staging-sets/${stagingSet.id}/comparison`)
        const data: StagingSetComparison = await r.json()
        if (!cancelled) setComparison(data)
      } finally {
        if (!cancelled) setIsLoadingComparison(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [stagingSet.id, hasMatch])

  // Initialize edit fields
  const startEditing = useCallback(() => {
    setEditFields({
      title: stagingSet.title,
      channelName: stagingSet.channelName,
      releaseDate: stagingSet.releaseDate
        ? new Date(stagingSet.releaseDate).toISOString().split('T')[0]
        : '',
      imageCount: stagingSet.imageCount?.toString() ?? '',
      artist: stagingSet.artist ?? '',
      description: stagingSet.description ?? '',
    })
    setIsEditing(true)
  }, [stagingSet])

  const saveEdits = useCallback(async () => {
    const updates: Record<string, unknown> = {}
    if (editFields.title !== stagingSet.title) updates.title = editFields.title
    if (editFields.channelName !== stagingSet.channelName) updates.channelName = editFields.channelName
    if (editFields.releaseDate) {
      const newDate = new Date(editFields.releaseDate)
      if (stagingSet.releaseDate && new Date(stagingSet.releaseDate).toISOString().split('T')[0] !== editFields.releaseDate) {
        updates.releaseDate = newDate
      } else if (!stagingSet.releaseDate) {
        updates.releaseDate = newDate
      }
    }
    const imgCount = editFields.imageCount ? parseInt(editFields.imageCount) : null
    if (imgCount !== stagingSet.imageCount) updates.imageCount = imgCount
    if ((editFields.artist || null) !== (stagingSet.artist ?? null)) updates.artist = editFields.artist || null
    if ((editFields.description || null) !== (stagingSet.description ?? null)) updates.description = editFields.description || null

    if (Object.keys(updates).length > 0) {
      await onFieldUpdate(stagingSet.id, updates)
    }
    setIsEditing(false)
  }, [editFields, stagingSet, onFieldUpdate])

  const badge = STATUS_BADGE[stagingSet.status]
  const participants = (stagingSet.participants as Array<{ name: string; icgId: string }>) ?? []

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{stagingSet.title}</h2>
            {badge && (
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', badge.className)}>
                {badge.label}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {stagingSet.channelName}
            {stagingSet.releaseDate && ` · ${new Date(stagingSet.releaseDate).toLocaleDateString()}`}
            {' · '}{stagingSet.isVideo ? 'Video' : 'Photo'}
          </p>
        </div>

        {isActionable && (
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <Button variant="outline" size="sm" onClick={startEditing}>
                Edit
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={saveEdits}>
                  <Save size={14} />
                  Save
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Match banners */}
      {hasMatch && isExactMatch && stagingSet.status !== 'PROMOTED' && (
        <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
          <div className="flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0 text-purple-500" />
            <div>
              <p className="text-sm font-medium text-purple-700 dark:text-purple-400">
                Exact match — will add participant and merge data
              </p>
              {stagingSet.matchDetails && (
                <p className="text-xs text-muted-foreground">{stagingSet.matchDetails}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {hasMatch && !isExactMatch && stagingSet.status !== 'PROMOTED' && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Possible match ({stagingSet.matchConfidence ? `${(stagingSet.matchConfidence * 100).toFixed(0)}%` : '?'} confidence)
              </p>
              {stagingSet.matchDetails && (
                <p className="text-xs text-muted-foreground">{stagingSet.matchDetails}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {stagingSet.status === 'PROMOTED' && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <Check size={14} />
            Successfully promoted to production
            {stagingSet.promotedSetId && (
              <Link
                href={`/sets/${stagingSet.promotedSetId}`}
                className="ml-auto flex items-center gap-1 text-xs hover:underline"
              >
                View Set <ExternalLink size={10} />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Comparison grid for matched sets */}
      {hasMatch && stagingSet.status !== 'PROMOTED' && (
        isLoadingComparison ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : comparison ? (
          <SetComparisonGrid comparison={comparison} />
        ) : null
      )}

      {/* Metadata card — editable when in edit mode */}
      {isEditing ? (
        <EditableMetadataCard
          fields={editFields}
          onChange={setEditFields}
          participants={participants}
        />
      ) : (
        <MetadataCard stagingSet={stagingSet} participants={participants} />
      )}

      {/* Notes + Priority */}
      <div className="rounded-lg border border-border/50 bg-card/50 p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Annotations
        </h3>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="w-20 text-xs font-medium text-muted-foreground">Priority</span>
            <select
              value={stagingSet.priority ?? 0}
              onChange={(e) => onFieldUpdate(stagingSet.id, { priority: Number(e.target.value) || null })}
              className="h-7 rounded border border-input bg-background px-2 text-xs"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-20 shrink-0 pt-1 text-xs font-medium text-muted-foreground">Notes</span>
            <textarea
              value={stagingSet.notes ?? ''}
              onChange={(e) => onFieldUpdate(stagingSet.id, { notes: e.target.value || null })}
              placeholder="Add notes..."
              rows={2}
              className="flex-1 rounded border border-input bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      {isActionable && (
        <div className="flex items-center gap-2">
          {stagingSet.status === 'PENDING' && (
            <Button variant="outline" size="sm" onClick={() => onStatusChange(stagingSet.id, 'REVIEWING')}>
              Mark Reviewing
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onStatusChange(stagingSet.id, 'APPROVED')}>
            <Check size={14} />
            Approve
          </Button>
          <Button variant="outline" size="sm" onClick={() => onStatusChange(stagingSet.id, 'INACTIVE')}>
            <Archive size={14} />
            Inactive
          </Button>
          <Button variant="outline" size="sm" onClick={() => onStatusChange(stagingSet.id, 'SKIPPED')}>
            <X size={14} />
            Skip
          </Button>
          {stagingSet.status === 'APPROVED' && (
            <Button size="sm" onClick={() => onPromote(stagingSet.id)} disabled={isProcessing}>
              {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Promote
            </Button>
          )}
        </div>
      )}

      {/* Reactivate for INACTIVE/SKIPPED */}
      {(stagingSet.status === 'INACTIVE' || stagingSet.status === 'SKIPPED') && (
        <Button variant="outline" size="sm" onClick={() => onStatusChange(stagingSet.id, 'PENDING')}>
          <RotateCcw size={14} />
          Reactivate
        </Button>
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function MetadataCard({
  stagingSet,
  participants,
}: {
  stagingSet: StagingSetWithRelations
  participants: Array<{ name: string; icgId: string }>
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/50 bg-card/50 p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Set Info
        </h3>
        <FieldRow label="Title" value={stagingSet.title} />
        <FieldRow label="External ID" value={stagingSet.externalId} />
        <FieldRow label="Channel" value={stagingSet.channelName} />
        <FieldRow label="Date" value={stagingSet.releaseDate ? new Date(stagingSet.releaseDate).toLocaleDateString() : null} />
        <FieldRow label="Type" value={stagingSet.isVideo ? 'Video' : 'Photo'} />
        <FieldRow label="Images" value={stagingSet.imageCount?.toString()} />
        <FieldRow label="Description" value={stagingSet.description} />
        <FieldRow label="Artist" value={stagingSet.artist} />
      </div>

      {participants.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/50 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Participants ({participants.length})
          </h3>
          {participants.map((p, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <span className="text-sm">{p.name}</span>
              <span className="text-[10px] text-muted-foreground">({p.icgId})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EditableMetadataCard({
  fields,
  onChange,
  participants,
}: {
  fields: Record<string, string>
  onChange: (fields: Record<string, string>) => void
  participants: Array<{ name: string; icgId: string }>
}) {
  const update = (key: string, value: string) => {
    onChange({ ...fields, [key]: value })
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-primary/20 bg-card/50 p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
          Editing Set Info
        </h3>
        <EditFieldRow label="Title" value={fields.title} onChange={(v) => update('title', v)} />
        <EditFieldRow label="Channel" value={fields.channelName} onChange={(v) => update('channelName', v)} />
        <EditFieldRow label="Date" value={fields.releaseDate} onChange={(v) => update('releaseDate', v)} type="date" />
        <EditFieldRow label="Images" value={fields.imageCount} onChange={(v) => update('imageCount', v)} type="number" />
        <EditFieldRow label="Artist" value={fields.artist} onChange={(v) => update('artist', v)} />
        <EditFieldRow label="Description" value={fields.description} onChange={(v) => update('description', v)} />
      </div>

      {participants.length > 0 && (
        <div className="rounded-lg border border-border/50 bg-card/50 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Participants ({participants.length})
          </h3>
          {participants.map((p, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <span className="text-sm">{p.name}</span>
              <span className="text-[10px] text-muted-foreground">({p.icgId})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  )
}

function EditFieldRow({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-sm"
      />
    </div>
  )
}
