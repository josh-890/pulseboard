'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import {
  FolderOpen, FolderCheck, FolderX,
  Check, Pencil, X, Save, Loader2, Flag, Film,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  recordArchivePathAction,
  clearArchivePathAction,
  toggleMediaQueueAction,
  updateMediaPriorityAction,
  confirmVideoFileAction,
  confirmArchiveFolderLinkAction,
  rejectArchiveSuggestionAction,
} from '@/lib/actions/archive-actions'
import type { ArchiveStatus } from '@/generated/prisma/client'
import { cn } from '@/lib/utils'
import { ArchiveStatusBanner } from '@/components/archive/archive-status-banner'
import { useRouter } from 'next/navigation'

// ─── Types ─────────────────────────────────────────────────────────────────────

type ArchiveSuggestionProp = {
  folderId: string
  folderName: string
  fullPath: string
  fileCount: number | null
  parsedDate: Date | null
  confidence: string | null
}

type SetArchivePanelProps = {
  setId: string
  isVideo: boolean
  archivePath: string | null
  archiveStatus: ArchiveStatus
  archiveLastChecked: Date | null
  archiveFileCount: number | null
  archiveFileCountPrev: number | null
  archiveVideoPresent: boolean | null
  archiveVideoFiles?: string[] | null
  archiveVideoFilename?: string | null
  mediaPriority: number | null
  mediaQueueAt: Date | null
  folderName?: string | null
  archiveSuggestion?: ArchiveSuggestionProp | null
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const ARCHIVE_STATUS_CONFIG: Record<ArchiveStatus, { label: string; dot: string; icon: React.ReactNode }> = {
  UNKNOWN:    { label: 'No path',    dot: 'bg-gray-400',   icon: <FolderOpen size={14} className="text-gray-400" /> },
  PENDING:    { label: 'Pending',    dot: 'bg-blue-400',   icon: <FolderOpen size={14} className="text-blue-400" /> },
  OK:         { label: 'OK',         dot: 'bg-green-500',  icon: <FolderCheck size={14} className="text-green-500" /> },
  CHANGED:    { label: 'Changed',    dot: 'bg-amber-500',  icon: <FolderCheck size={14} className="text-amber-500" /> },
  MISSING:    { label: 'Missing',    dot: 'bg-red-500',    icon: <FolderX size={14} className="text-red-500" /> },
  INCOMPLETE: { label: 'Incomplete', dot: 'bg-orange-500', icon: <FolderX size={14} className="text-orange-500" /> },
}

const PRIORITY_OPTIONS = [
  { value: 1, label: 'P1 — High' },
  { value: 2, label: 'P2 — Medium' },
  { value: 3, label: 'P3 — Low' },
]

const PRIORITY_CLASS: Record<number, string> = {
  1: 'bg-red-500/15 text-red-600 dark:text-red-400',
  2: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  3: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function SetArchivePanel(props: SetArchivePanelProps) {
  const {
    setId, isVideo,
    archivePath: initialPath,
    archiveStatus: initialStatus,
    archiveLastChecked: initialChecked,
    archiveFileCount: initialFileCount,
    archiveFileCountPrev: initialFileCountPrev,
    archiveVideoPresent: initialVideoPresent,
    archiveVideoFiles,
    archiveVideoFilename: initialVideoFilename,
    mediaPriority: initialPriority,
    mediaQueueAt: initialQueueAt,
    folderName,
    archiveSuggestion,
  } = props

  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [suggestionDismissed, setSuggestionDismissed] = useState(false)

  // Local state so the panel is immediately reactive without a full page reload
  const [archivePath, setArchivePath] = useState(initialPath)
  const [archiveStatus, setArchiveStatus] = useState(initialStatus)
  const [archiveLastChecked] = useState(initialChecked)
  const [archiveFileCount] = useState(initialFileCount)
  const [archiveFileCountPrev] = useState(initialFileCountPrev)
  const [archiveVideoPresent, setArchiveVideoPresent] = useState(initialVideoPresent)
  const [archiveVideoFilename, setArchiveVideoFilename] = useState(initialVideoFilename ?? null)
  const [mediaPriority, setMediaPriority] = useState(initialPriority)
  const [mediaQueueAt, setMediaQueueAt] = useState(initialQueueAt)
  const [confirmingVideo, setConfirmingVideo] = useState(false)

  const [archiveRoot, setArchiveRoot] = useState<string | null>(null)
  const [suggestedPath, setSuggestedPath] = useState<string | null>(null)
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editPath, setEditPath] = useState(initialPath ?? '')
  const [isSaving, setIsSaving] = useState(false)

  const hasPath = !!archivePath
  const inQueue = !!mediaQueueAt
  const statusCfg = ARCHIVE_STATUS_CONFIG[archiveStatus]

  // Fetch current archive root for display
  useEffect(() => {
    const rootKey = isVideo ? 'archive.videosetRoot' : 'archive.photosetRoot'
    fetch(`/api/settings/value?key=${encodeURIComponent(rootKey)}`)
      .then((r) => r.json())
      .then((d: { value: string | null }) => setArchiveRoot(d.value))
      .catch(() => {})
  }, [isVideo])

  // Auto-suggest relative path when no path is set
  useEffect(() => {
    if (hasPath) return
    let cancelled = false
    setIsLoadingSuggestion(true)
    fetch(`/api/sets/${setId}/archive-path-suggestion`)
      .then((r) => r.json())
      .then((d: { path: string | null }) => { if (!cancelled) setSuggestedPath(d.path) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoadingSuggestion(false) })
    return () => { cancelled = true }
  }, [setId, hasPath])

  const handleConfirm = useCallback(async (path: string) => {
    if (!path.trim()) return
    setIsSaving(true)
    try {
      await recordArchivePathAction(setId, 'set', path.trim())
      setArchivePath(path.trim())
      setArchiveStatus('PENDING')
      setEditPath(path.trim())
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }, [setId])

  const handleClear = useCallback(async () => {
    setIsSaving(true)
    try {
      await clearArchivePathAction(setId, 'set')
      setArchivePath(null)
      setArchiveStatus('UNKNOWN')
      setSuggestedPath(null)
      setEditPath('')
    } finally {
      setIsSaving(false)
    }
  }, [setId])

  const handleQueueToggle = useCallback(async () => {
    const newInQueue = !inQueue
    // Optimistic update
    setMediaQueueAt(newInQueue ? new Date() : null)
    if (!newInQueue) setMediaPriority(null)
    else setMediaPriority((p) => p ?? 2)
    await toggleMediaQueueAction(setId, 'set', mediaPriority ?? 2)
  }, [setId, inQueue, mediaPriority])

  const handlePriorityChange = useCallback(async (value: number) => {
    setMediaPriority(value)
    await updateMediaPriorityAction(setId, 'set', value)
  }, [setId])

  const handleConfirmVideo = useCallback(async (filename: string) => {
    setConfirmingVideo(true)
    try {
      await confirmVideoFileAction(setId, 'set', filename)
      setArchiveVideoPresent(true)
      setArchiveVideoFilename(filename)
      setArchiveStatus('OK')
    } finally {
      setConfirmingVideo(false)
    }
  }, [setId])

  return (
    <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {statusCfg.icon}
          <h2 className="text-lg font-semibold">Archive</h2>
          {hasPath && (
            <span className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              archiveStatus === 'OK'         && 'bg-green-500/15 text-green-600 dark:text-green-400',
              archiveStatus === 'PENDING'    && 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
              archiveStatus === 'CHANGED'    && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
              archiveStatus === 'MISSING'    && 'bg-red-500/15 text-red-600 dark:text-red-400',
              archiveStatus === 'INCOMPLETE' && 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
            )}>
              {statusCfg.label}
            </span>
          )}
        </div>

        {/* Queue toggle */}
        <button
          type="button"
          onClick={handleQueueToggle}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            inQueue
              ? 'bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 dark:text-amber-400'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
          title={inQueue ? 'Remove from shopping list' : 'Add to shopping list'}
        >
          <Flag size={13} className={inQueue ? 'fill-current' : ''} />
          {inQueue ? 'On list' : 'Add to list'}
          {inQueue && mediaPriority && (
            <span className={cn('rounded px-1 py-0.5 text-[10px] font-bold', PRIORITY_CLASS[mediaPriority])}>
              P{mediaPriority}
            </span>
          )}
        </button>
      </div>

      {/* Priority selector (when in queue) */}
      {inQueue && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Priority:</span>
          <div className="flex gap-1">
            {PRIORITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handlePriorityChange(opt.value)}
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                  mediaPriority === opt.value
                    ? PRIORITY_CLASS[opt.value]
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                P{opt.value}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border/40" />

      {/* Possible archive match banner — shown when no path is set and a suggestion exists */}
      {archiveSuggestion && archiveStatus === 'UNKNOWN' && !suggestionDismissed && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Possible archive match</p>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate" title={archiveSuggestion.folderName}>
                {archiveSuggestion.folderName}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground/70 truncate" title={archiveSuggestion.fullPath}>
                {archiveSuggestion.fullPath}
              </p>
            </div>

            {archiveSuggestion.fileCount != null && (
              <span className="shrink-0 text-[10px] text-muted-foreground">{archiveSuggestion.fileCount} files</span>
            )}

            <span className={cn(
              'shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium',
              archiveSuggestion.confidence === 'HIGH'
                ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
            )}>
              {archiveSuggestion.confidence === 'HIGH' ? 'exact' : 'approx'}
            </span>

            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(async () => {
                const res = await confirmArchiveFolderLinkAction(archiveSuggestion.folderId, setId, 'set')
                if (res.success) router.refresh()
              })}
              className="shrink-0 flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-50"
            >
              <Check size={11} /> Confirm
            </button>

            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(async () => {
                await rejectArchiveSuggestionAction(archiveSuggestion.folderId)
                setSuggestionDismissed(true)
              })}
              className="shrink-0 text-muted-foreground/40 hover:text-red-500 transition-colors"
              title="Dismiss suggestion"
            >
              <X size={11} />
            </button>
          </div>
        </div>
      )}

      {/* Archive status banner */}
      <ArchiveStatusBanner
        archiveStatus={archiveStatus}
        folderName={folderName ?? archivePath?.split(/[\\/]/).pop() ?? null}
        fileCount={archiveFileCount}
        lastChecked={archiveLastChecked}
      />

      {/* Root hint */}
      {archiveRoot && (
        <p className="text-xs text-muted-foreground/70">
          Root: <code className="rounded bg-muted/40 px-1">{archiveRoot}</code>
        </p>
      )}

      {/* Path section */}
      {hasPath ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Relative folder path:</p>

          {isEditing ? (
            <div className="space-y-2">
              <Input
                value={editPath}
                onChange={(e) => setEditPath(e.target.value)}
                placeholder={`e.g. MA-MySite\\2012\\2012-08-08-MA Jane - Waterworld\\`}
                className="font-mono text-xs"
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleConfirm(editPath)} disabled={isSaving || !editPath.trim()}>
                  <Save size={13} /> Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setIsEditing(false); setEditPath(archivePath ?? '') }}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <code className="flex-1 break-all rounded bg-muted/50 px-2 py-1.5 text-xs leading-snug text-muted-foreground">
                {archivePath}
              </code>
              <button
                type="button"
                onClick={() => { setIsEditing(true); setEditPath(archivePath ?? '') }}
                className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Edit path"
              >
                <Pencil size={13} />
              </button>
            </div>
          )}

          {/* Scan details */}
          {archiveLastChecked && (
            <div className="space-y-0.5 text-xs text-muted-foreground">
              <div>Last checked: {new Date(archiveLastChecked).toLocaleString()}</div>
              {archiveFileCount != null && (
                <div>
                  {isVideo ? 'Frames' : 'Files'}: {archiveFileCount}
                  {archiveFileCountPrev != null && archiveFileCountPrev !== archiveFileCount && (
                    <span className="ml-1 text-amber-500">(was {archiveFileCountPrev})</span>
                  )}
                </div>
              )}
              {isVideo && (
                archiveVideoPresent
                  ? (
                    <div className="flex items-center gap-1.5 text-green-500">
                      <Film size={11} />
                      {archiveVideoFilename ?? 'Video file present'}
                    </div>
                  )
                  : archiveVideoFiles && archiveVideoFiles.length > 0
                    ? (
                      <div className="space-y-1.5">
                        <p className="text-xs text-amber-500">
                          {archiveVideoFiles.length} video file{archiveVideoFiles.length !== 1 ? 's' : ''} found — confirm the correct one:
                        </p>
                        {archiveVideoFiles.map((f) => (
                          <div key={f} className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1.5">
                            <code className="flex-1 truncate text-xs text-muted-foreground">{f}</code>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 shrink-0 px-2 text-xs"
                              onClick={() => handleConfirmVideo(f)}
                              disabled={confirmingVideo}
                            >
                              <Check size={11} /> Confirm
                            </Button>
                          </div>
                        ))}
                      </div>
                    )
                    : archiveVideoPresent === false
                      ? <div className="text-xs text-red-500">No video file found</div>
                      : null
              )}
            </div>
          )}

          {!isEditing && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
              onClick={handleClear}
              disabled={isSaving}
            >
              <X size={12} /> Clear path
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {isLoadingSuggestion ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={13} className="animate-spin" />
              Building suggested path…
            </div>
          ) : suggestedPath ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Suggested relative path:</p>
              {isEditing ? (
                <div className="space-y-2">
                  <Input
                    value={editPath}
                    onChange={(e) => setEditPath(e.target.value)}
                    placeholder={`e.g. MA-MySite\\2012\\2012-08-08-MA Jane - Waterworld\\`}
                    className="font-mono text-xs"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleConfirm(editPath)} disabled={isSaving || !editPath.trim()}>
                      <Save size={13} /> Confirm
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setIsEditing(false); setEditPath(suggestedPath) }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <code className="block break-all rounded bg-muted/50 px-2 py-1.5 text-xs leading-snug text-muted-foreground">
                    {suggestedPath}
                  </code>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleConfirm(suggestedPath)} disabled={isSaving}>
                      <Check size={13} /> Confirm
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setIsEditing(true); setEditPath(suggestedPath) }}>
                      <Pencil size={13} /> Edit
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {isEditing ? (
                <>
                  <p className="text-xs text-muted-foreground">Relative folder path (from root above):</p>
                  <Input
                    value={editPath}
                    onChange={(e) => setEditPath(e.target.value)}
                    placeholder={`e.g. MA-MySite\\2012\\2012-08-08-MA Jane - Waterworld\\`}
                    className="font-mono text-xs"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleConfirm(editPath)} disabled={isSaving || !editPath.trim()}>
                      <Save size={13} /> Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                  <FolderOpen size={13} /> Enter relative path manually
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
