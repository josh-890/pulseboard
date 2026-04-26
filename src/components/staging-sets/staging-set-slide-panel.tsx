'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Check,
  X,
  Archive,
  Loader2,
  AlertTriangle,
  ExternalLink,
  RotateCcw,
  Save,
  FolderOpen,
  FolderCheck,
  FolderX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { StagingSetCoverUpload } from './staging-set-cover-upload'
import { SetComparisonGrid } from '@/components/import/set-comparison-grid'
import { ArchiveFolderPicker } from './archive-folder-picker'
import { ArchiveStatusBanner } from '@/components/archive/archive-status-banner'
import type { StagingSetWithRelations, StagingSetComparison } from '@/lib/services/import/staging-set-service'
import type { StagingSetStatus, ArchiveStatus } from '@/generated/prisma/client'
// (recordArchivePathAction / clearArchivePathAction removed — scan-first workflow only)
import Link from 'next/link'

// ─── Constants ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-blue-500/10 text-blue-600' },
  REVIEWING: { label: 'Reviewing', className: 'bg-yellow-500/10 text-yellow-600' },
  APPROVED: { label: 'Approved', className: 'bg-cyan-500/10 text-cyan-600' },
  PROMOTED: { label: 'Promoted', className: 'bg-green-500 text-white font-semibold' },
  INACTIVE: { label: 'Inactive', className: 'bg-gray-500/10 text-gray-600 dark:text-gray-500' },
  SKIPPED: { label: 'Skipped', className: 'bg-gray-500/10 text-gray-600 dark:text-gray-500' },
}

const PRIORITY_OPTIONS = [
  { value: 0, label: 'No priority' },
  { value: 1, label: 'Low' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'High' },
  { value: 4, label: 'Urgent' },
]

// ─── Props ─────────────────────────────────────────────────────────────────

type StagingSetSlidePanelProps = {
  stagingSet: StagingSetWithRelations | null
  isOpen: boolean
  onClose: () => void
  onStatusChange: (id: string, status: StagingSetStatus) => Promise<void>
  onPromote: (id: string) => Promise<void>
  onFieldUpdate: (id: string, fields: Record<string, unknown>) => Promise<void>
  onRefresh: () => void
  isProcessing: boolean
}

// ─── Component ─────────────────────────────────────────────────────────────

export function StagingSetSlidePanel({
  stagingSet,
  isOpen,
  onClose,
  onStatusChange,
  onPromote,
  onFieldUpdate,
  onRefresh,
  isProcessing,
}: StagingSetSlidePanelProps) {
  if (!isOpen || !stagingSet) {
    return <div className="w-0 shrink-0 overflow-hidden transition-all duration-300" />
  }

  return (
    <div className="w-[400px] shrink-0 overflow-hidden border-l border-border/50 transition-all duration-300">
      <PanelContent
        key={stagingSet.id}
        stagingSet={stagingSet}
        onClose={onClose}
        onStatusChange={onStatusChange}
        onPromote={onPromote}
        onFieldUpdate={onFieldUpdate}
        onRefresh={onRefresh}
        isProcessing={isProcessing}
      />
    </div>
  )
}

// Separate inner component to reset state on key change
function PanelContent({
  stagingSet,
  onClose,
  onStatusChange,
  onPromote,
  onFieldUpdate,
  onRefresh,
  isProcessing,
}: Omit<StagingSetSlidePanelProps, 'isOpen'> & { stagingSet: StagingSetWithRelations }) {
  const [comparison, setComparison] = useState<StagingSetComparison | null>(null)
  const [isLoadingComparison, setIsLoadingComparison] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editFields, setEditFields] = useState<Record<string, string>>({})
  const [pickerOpen, setPickerOpen] = useState(false)

  const hasMatch = !!stagingSet.matchedSetId
  const isExactMatch = hasMatch && stagingSet.matchConfidence === 1.0
  const isActionable = stagingSet.status === 'PENDING' || stagingSet.status === 'REVIEWING' || stagingSet.status === 'APPROVED'
  const badge = STATUS_BADGE[stagingSet.status]
  const participants = (stagingSet.participants as Array<{ name: string; icgId: string }>) ?? []

  // Archive state — sourced from ArchiveLink (one per folder, one-to-one).
  const isPromoted = stagingSet.status === 'PROMOTED'
  const confirmedLink = isPromoted
    ? (stagingSet.promotedSet?.archiveLinks?.[0] ?? stagingSet.archiveLinks?.[0] ?? null)
    : (stagingSet.archiveLinks?.[0] ?? null)
  const confirmedFolder = confirmedLink?.archiveFolder ?? null
  const suggestion = isPromoted ? null : (!confirmedFolder ? (stagingSet.suggestedArchiveFolder ?? null) : null)
  const dateStr = stagingSet.releaseDate
    ? new Date(stagingSet.releaseDate).toISOString().split('T')[0]
    : null
  const expectedFolderName = dateStr && stagingSet.channel?.shortName
    ? `${dateStr}-${stagingSet.channel.shortName} ${participants[0]?.name ?? 'Unknown'} - ${stagingSet.title}`
    : null
  const expectedRelativePath = expectedFolderName && stagingSet.channel?.channelFolder
    ? `${stagingSet.channel.channelFolder}\\${new Date(stagingSet.releaseDate!).getFullYear()}\\${expectedFolderName}`
    : expectedFolderName
  const pickerInitialQuery = [
    stagingSet.channel?.shortName,
    dateStr ? dateStr.slice(0, 4) : '',
  ].filter(Boolean).join(' ')

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

  const handleConfirmMatch = useCallback(async () => {
    await fetch(`/api/staging-sets/${stagingSet.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchConfidence: 1.0 }),
    })
    onRefresh()
  }, [stagingSet.id, onRefresh])

  const handleClearMatch = useCallback(async () => {
    await fetch(`/api/staging-sets/${stagingSet.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchedSetId: null, matchConfidence: null, matchDetails: null }),
    })
    setComparison(null)
    onRefresh()
  }, [stagingSet.id, onRefresh])

  const handleApplyField = useCallback(async (field: string) => {
    if (!comparison?.matchedSet) return
    const r = await fetch(`/api/staging-sets/${stagingSet.id}/apply-field`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, matchedSetId: comparison.matchedSet.id }),
    })
    if (r.ok) {
      const updated = await r.json()
      setComparison(updated)
    }
  }, [stagingSet.id, comparison])

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleCoverUploaded = useCallback((_coverUrl: string | null) => {
    onRefresh()
  }, [onRefresh])

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2 overflow-hidden">
          <h2 className="truncate text-sm font-semibold">{stagingSet.title}</h2>
          {badge && (
            <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', badge.className)}>
              {badge.label}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-4 p-4">
        {/* Cover image upload */}
        <StagingSetCoverUpload
          stagingSetId={stagingSet.id}
          currentUrl={stagingSet.coverImageUrl}
          onUploaded={handleCoverUploaded}
        />

        {/* Match banners */}
        {hasMatch && isExactMatch && stagingSet.status !== 'PROMOTED' && (
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
            <div className="flex items-start gap-2">
              <Check size={14} className="mt-0.5 shrink-0 text-purple-500" />
              <p className="text-xs font-medium text-purple-700 dark:text-purple-400">
                Confirmed match — will add participant and merge data on promote
              </p>
            </div>
          </div>
        )}

        {hasMatch && !isExactMatch && stagingSet.status !== 'PROMOTED' && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Possible match ({stagingSet.matchConfidence ? `${(stagingSet.matchConfidence * 100).toFixed(0)}%` : '?'})
              </p>
            </div>
          </div>
        )}

        {stagingSet.status === 'PROMOTED' && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
              <Check size={14} />
              Promoted to production
              {stagingSet.promotedSetId && (
                <Link
                  href={`/sets/${stagingSet.promotedSetId}`}
                  className="ml-auto flex items-center gap-1 hover:underline"
                >
                  View Set <ExternalLink size={10} />
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Duplicate action banner */}
        {(stagingSet.isDuplicate || stagingSet.duplicateGroupId) && stagingSet.status !== 'SKIPPED' && (
          <div className={cn(
            'rounded-lg border p-3',
            stagingSet.duplicateGroupId
              ? 'border-orange-500/30 bg-orange-500/8'
              : 'border-amber-500/30 bg-amber-500/8',
          )}>
            <p className={cn(
              'mb-1 text-xs font-semibold',
              stagingSet.duplicateGroupId
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-amber-600 dark:text-amber-400',
            )}>
              {stagingSet.duplicateGroupId ? 'Confirmed duplicate' : 'Possible duplicate'}
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              {stagingSet.duplicateGroupId
                ? 'Same set was already imported from another file. Resolve to hide it and prevent re-flagging on future imports.'
                : 'Another staging set shares the same channel and release date. Resolve if this is confirmed the same set, or dismiss if they are different sets.'}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  'text-xs',
                  stagingSet.duplicateGroupId
                    ? 'border-orange-500/40 text-orange-600 hover:bg-orange-500/10 dark:text-orange-400'
                    : 'border-amber-500/40 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400',
                )}
                disabled={isProcessing}
                onClick={async () => {
                  await fetch(`/api/staging-sets/${stagingSet.id}/resolve-duplicate`, { method: 'POST' })
                  onRefresh()
                }}
              >
                <Archive size={12} />
                Resolve (skip)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-muted-foreground hover:text-foreground"
                disabled={isProcessing}
                onClick={() => onFieldUpdate(stagingSet.id, { isDuplicate: false, duplicateGroupId: null })}
              >
                <RotateCcw size={12} />
                Dismiss warning
              </Button>
            </div>
          </div>
        )}

        {/* Comparison grid */}
        {hasMatch && stagingSet.status !== 'PROMOTED' && (
          isLoadingComparison ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            </div>
          ) : comparison ? (
            <SetComparisonGrid
              comparison={comparison}
              onConfirmMatch={handleConfirmMatch}
              onClearMatch={handleClearMatch}
              onApplyField={handleApplyField}
            />
          ) : null
        )}

        {/* Metadata card */}
        {isEditing ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Editing</h3>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
                <Button size="sm" onClick={saveEdits}><Save size={12} /> Save</Button>
              </div>
            </div>
            <div className="rounded-lg border border-primary/20 bg-card/50 p-3">
              <EditFieldRow label="Title" value={editFields.title} onChange={(v) => setEditFields({ ...editFields, title: v })} />
              <EditFieldRow label="Channel" value={editFields.channelName} onChange={(v) => setEditFields({ ...editFields, channelName: v })} />
              <EditFieldRow label="Date" value={editFields.releaseDate} onChange={(v) => setEditFields({ ...editFields, releaseDate: v })} type="date" />
              <EditFieldRow label="Images" value={editFields.imageCount} onChange={(v) => setEditFields({ ...editFields, imageCount: v })} type="number" />
              <EditFieldRow label="Artist" value={editFields.artist} onChange={(v) => setEditFields({ ...editFields, artist: v })} />
              <EditFieldRow label="Description" value={editFields.description} onChange={(v) => setEditFields({ ...editFields, description: v })} />
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border/50 bg-card/50 p-3">
            <div className="flex items-center justify-between">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Set Info</h3>
              {isActionable && (
                <Button variant="ghost" size="sm" onClick={startEditing} className="h-6 text-xs">Edit</Button>
              )}
            </div>
            <FieldRow label="Title" value={stagingSet.title} />
            <FieldRow label="External ID" value={stagingSet.externalId} />
            <FieldRow label="Channel" value={stagingSet.channelName} warn={!stagingSet.channelId} />
            <FieldRow label="Date" value={stagingSet.releaseDate ? new Date(stagingSet.releaseDate).toISOString().split('T')[0] : null} />
            <FieldRow label="Type" value={stagingSet.isVideo ? 'Video' : 'Photo'} />
            <FieldRow label="Images" value={stagingSet.imageCount?.toString()} />
            <FieldRow label="Artist" value={stagingSet.artist} />
            {stagingSet.description && <FieldRow label="Description" value={stagingSet.description} />}
          </div>
        )}

        {/* Participants */}
        {participants.length > 0 && (
          <div className="rounded-lg border border-border/50 bg-card/50 p-3">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Participants ({participants.length})
            </h3>
            {participants.map((p, i) => (
              <div key={i} className="flex items-center gap-2 py-1">
                <span className="text-xs">{p.name}</span>
                <span className="text-[10px] text-muted-foreground">({p.icgId})</span>
              </div>
            ))}
          </div>
        )}

        {/* Archive status banner */}
        <ArchiveStatusBanner
          archiveStatus={confirmedLink?.archiveStatus ?? null}
          folderName={confirmedFolder?.folderName ?? null}
          fileCount={confirmedLink?.archiveFileCount ?? null}
          lastChecked={confirmedFolder?.scannedAt ?? null}
          archiveFolderId={confirmedFolder?.id ?? null}
          suggestedFolder={suggestion}
          stagingSetId={isPromoted ? undefined : stagingSet.id}
          expectedPath={!isPromoted && !confirmedFolder && !suggestion ? (expectedRelativePath ?? null) : null}
          onPickerOpen={isPromoted ? undefined : () => setPickerOpen(true)}
          onArchiveChange={isPromoted ? undefined : onRefresh}
        />

        {/* For PROMOTED staging sets, show a link to the canonical promoted Set */}
        {isPromoted && stagingSet.promotedSet && (
          <div className="flex justify-end">
            <a
              href={`/sets/${stagingSet.promotedSet.id}`}
              className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              Manage archive on promoted Set →
            </a>
          </div>
        )}

        {/* Archive path detail (non-promoted only) */}
        {!isPromoted && <ArchiveSection stagingSet={stagingSet} onRefresh={onRefresh} />}

        {/* Annotations */}
        <div className="rounded-lg border border-border/50 bg-card/50 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Annotations</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="w-16 text-xs font-medium text-muted-foreground">Priority</span>
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
              <span className="w-16 shrink-0 pt-1 text-xs font-medium text-muted-foreground">Notes</span>
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
          <div className="flex flex-wrap items-center gap-2">
            {stagingSet.status === 'PENDING' && (
              <Button variant="outline" size="sm" onClick={() => onStatusChange(stagingSet.id, 'REVIEWING')}>
                Mark Reviewing
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => onStatusChange(stagingSet.id, 'APPROVED')}>
              <Check size={14} /> Approve
            </Button>
            <Button variant="outline" size="sm" onClick={() => onStatusChange(stagingSet.id, 'INACTIVE')}>
              <Archive size={14} /> Inactive
            </Button>
            <Button variant="outline" size="sm" onClick={() => onStatusChange(stagingSet.id, 'SKIPPED')}>
              <X size={14} /> Skip
            </Button>
            {stagingSet.status === 'APPROVED' && (
              <Button size="sm" onClick={() => onPromote(stagingSet.id)} disabled={isProcessing}>
                {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Promote
              </Button>
            )}
          </div>
        )}

        {/* Reactivate */}
        {(stagingSet.status === 'INACTIVE' || stagingSet.status === 'SKIPPED') && (
          <Button variant="outline" size="sm" onClick={() => onStatusChange(stagingSet.id, 'PENDING')}>
            <RotateCcw size={14} /> Reactivate
          </Button>
        )}
      </div>

      {/* Archive folder picker sheet (non-promoted only) */}
      {pickerOpen && !isPromoted && (
        <ArchiveFolderPicker
          open={pickerOpen}
          onOpenChange={(open) => {
            setPickerOpen(open)
            if (!open) onRefresh()
          }}
          stagingSetId={stagingSet.id}
          initialQuery={pickerInitialQuery}
        />
      )}
    </div>
  )
}

// ─── Archive Status Config ──────────────────────────────────────────────────

const ARCHIVE_STATUS_CONFIG: Record<ArchiveStatus, { label: string; dot: string; icon: React.ReactNode }> = {
  UNKNOWN:    { label: 'No path',   dot: 'bg-gray-400',   icon: <FolderOpen size={13} className="text-gray-400" /> },
  PENDING:    { label: 'Pending',   dot: 'bg-blue-400',   icon: <FolderOpen size={13} className="text-blue-400" /> },
  OK:         { label: 'OK',        dot: 'bg-green-500',  icon: <FolderCheck size={13} className="text-green-500" /> },
  CHANGED:    { label: 'Changed',   dot: 'bg-amber-500',  icon: <FolderCheck size={13} className="text-amber-500" /> },
  MISSING:    { label: 'Missing',   dot: 'bg-red-500',    icon: <FolderX size={13} className="text-red-500" /> },
  INCOMPLETE: { label: 'Incomplete',dot: 'bg-orange-500', icon: <FolderX size={13} className="text-orange-500" /> },
}

// ─── Archive Section ────────────────────────────────────────────────────────

type ArchiveSectionProps = {
  stagingSet: StagingSetWithRelations
  onRefresh: () => void
}

function ArchiveSection({ stagingSet }: ArchiveSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const isPromoted = stagingSet.status === 'PROMOTED'
  const archiveLink = isPromoted
    ? (stagingSet.promotedSet?.archiveLinks?.[0] ?? stagingSet.archiveLinks?.[0] ?? null)
    : (stagingSet.archiveLinks?.[0] ?? null)
  const archiveStatus = (archiveLink?.archiveStatus ?? 'UNKNOWN') as ArchiveStatus
  const statusCfg = ARCHIVE_STATUS_CONFIG[archiveStatus]
  const hasPath = !!archiveLink?.archivePath
  const pendingScan = archiveStatus === 'PENDING'

  return (
    <div className="rounded-lg border border-border/50 bg-card/50">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          {statusCfg.icon}
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Archive</h3>
          {hasPath && (
            <span className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
              pendingScan && 'bg-muted/60 text-muted-foreground',
              !pendingScan && archiveStatus === 'OK' && 'bg-green-500/15 text-green-600 dark:text-green-400',
              !pendingScan && archiveStatus === 'CHANGED' && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
              !pendingScan && archiveStatus === 'MISSING' && 'bg-red-500/15 text-red-600 dark:text-red-400',
              !pendingScan && archiveStatus === 'INCOMPLETE' && 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
            )}>
              {pendingScan ? 'Scan pending' : statusCfg.label}
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {isExpanded && (
        <div className="border-t border-border/40 px-3 pb-3 pt-2 space-y-2.5">
          {hasPath ? (
            <>
              <div className="flex items-start gap-1.5">
                <code className="flex-1 break-all rounded bg-muted/50 px-1.5 py-1 text-[10px] leading-tight text-muted-foreground">
                  {archiveLink!.archivePath}
                </code>
              </div>
              {archiveLink?.archiveLastChecked && (
                <div className="space-y-0.5 text-[10px] text-muted-foreground">
                  <div>Last checked: {new Date(archiveLink.archiveLastChecked).toLocaleString()}</div>
                  {archiveLink.archiveFileCount != null && (
                    <div>
                      {stagingSet.isVideo ? 'Frames' : 'Files'}: {archiveLink.archiveFileCount}
                      {archiveLink.archiveFileCountPrev != null && archiveLink.archiveFileCountPrev !== archiveLink.archiveFileCount && (
                        <span className="ml-1 text-amber-500">
                          (was {archiveLink.archiveFileCountPrev})
                        </span>
                      )}
                    </div>
                  )}
                  {stagingSet.isVideo && archiveLink.archiveVideoPresent != null && (
                    <div className={archiveLink.archiveVideoPresent ? 'text-green-500' : 'text-red-500'}>
                      Video file: {archiveLink.archiveVideoPresent ? 'present' : 'missing'}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-[10px] text-muted-foreground/60">
              {isPromoted
                ? 'No archive folder linked to this set yet. Run the archive scanner to link automatically.'
                : 'No archive folder linked. Archive scanner will link automatically when found.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function FieldRow({ label, value, warn }: { label: string; value: string | null | undefined; warn?: boolean }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-1">
      <span className="w-20 shrink-0 text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className={cn('text-xs', warn && 'text-amber-500')}>{value}</span>
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
    <div className="flex items-center gap-3 py-1">
      <span className="w-20 shrink-0 text-[11px] font-medium text-muted-foreground">{label}</span>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs"
      />
    </div>
  )
}
