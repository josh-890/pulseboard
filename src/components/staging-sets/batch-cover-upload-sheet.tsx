'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, CheckCircle2, Circle, Loader2, Upload, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFileDrop } from '@/lib/hooks/use-file-drop'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { StagingSetWithRelations } from '@/lib/services/import/staging-set-service'

// ─── Types ─────────────────────────────────────────────────────────────────

type Confidence = 'high' | 'medium' | 'none'

type MatchResult = {
  set: StagingSetWithRelations
  file: File | null
  confidence: Confidence
  /** Whether this match is included in the upload batch */
  included: boolean
}

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

type BatchCoverUploadSheetProps = {
  open: boolean
  onClose: () => void
  missingSets: StagingSetWithRelations[]
  onBatchUploaded: (results: Array<{ id: string; url: string }>) => void
}

// ─── Matching logic ─────────────────────────────────────────────────────────

function computeMatches(
  sets: StagingSetWithRelations[],
  files: File[],
): { matches: MatchResult[]; unmatchedFiles: File[] } {
  const usedFiles = new Set<File>()

  // Sort by externalId length descending so longer (more specific) IDs claim
  // their file before shorter IDs that are substrings of them.
  const sortedSets = [...sets].sort(
    (a, b) => (b.externalId?.length ?? 0) - (a.externalId?.length ?? 0),
  )

  const matchMap = new Map<string, { file: File; confidence: Confidence }>()

  for (const set of sortedSets) {
    if (!set.externalId) continue
    const extId = set.externalId.toLowerCase()
    const matched = files.find((f) => !usedFiles.has(f) && f.name.toLowerCase().includes(extId))
    if (!matched) continue

    usedFiles.add(matched)

    const dateMatch = matched.name.match(/^(\d{4}-\d{2}-\d{2})-/)
    const fileDate = dateMatch?.[1] ?? null
    const setDate = set.releaseDate
      ? new Date(set.releaseDate).toISOString().split('T')[0]
      : null
    const dateOk = !fileDate || !setDate || fileDate === setDate

    const channelShort = (set.channel?.shortName ?? set.channelName ?? '').toLowerCase()
    const channelOk = !channelShort || matched.name.toLowerCase().includes(channelShort)

    matchMap.set(set.id, {
      file: matched,
      confidence: dateOk && channelOk ? 'high' : 'medium',
    })
  }

  const matches: MatchResult[] = sets.map((set) => {
    const m = matchMap.get(set.id)
    if (!m) return { set, file: null, confidence: 'none', included: false }
    return { set, file: m.file, confidence: m.confidence, included: true }
  })

  const unmatchedFiles = files.filter((f) => !usedFiles.has(f))
  return { matches, unmatchedFiles }
}

// ─── Confidence badge ───────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  if (confidence === 'high') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-500">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        High
      </span>
    )
  }
  if (confidence === 'medium') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Medium
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
      No match
    </span>
  )
}

// ─── Component ─────────────────────────────────────────────────────────────

export function BatchCoverUploadSheet({
  open,
  onClose,
  missingSets,
  onBatchUploaded,
}: BatchCoverUploadSheetProps) {
  const [setType, setSetType] = useState<'photo' | 'video'>('photo')
  const [files, setFiles] = useState<File[]>([])
  const [included, setIncluded] = useState<Set<string>>(new Set())
  const [uploadStates, setUploadStates] = useState<Map<string, UploadStatus>>(new Map())
  const [isUploading, setIsUploading] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Filter to the selected type
  const setsForType = useMemo(
    () => missingSets.filter((s) => s.isVideo === (setType === 'video')),
    [missingSets, setType],
  )

  // Reset files and upload state when type is switched
  useEffect(() => {
    setFiles([])
    setUploadStates(new Map())
    setIsDone(false)
  }, [setType])

  const { matches, unmatchedFiles } = useMemo(
    () => computeMatches(setsForType, files),
    [setsForType, files],
  )

  // Sync included set when matches change (auto-include matched files)
  useEffect(() => {
    setIncluded(new Set(
      matches.filter((m) => m.file !== null).map((m) => m.set.id),
    ))
  }, [matches])

  const includedMatches = useMemo(
    () => matches.filter((m) => m.file !== null && included.has(m.set.id)),
    [matches, included],
  )

  const handleFiles = useCallback((fileList: FileList) => {
    setFiles(Array.from(fileList).filter((f) => f.type.startsWith('image/')))
    setUploadStates(new Map())
    setIsDone(false)
  }, [])

  const { isDragOver, dropProps } = useFileDrop(handleFiles)

  const toggleIncluded = useCallback((id: string) => {
    setIncluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleUploadAll = useCallback(async () => {
    if (includedMatches.length === 0 || isUploading) return
    setIsUploading(true)

    const results: Array<{ id: string; url: string }> = []

    await Promise.allSettled(
      includedMatches.map(async ({ set, file }) => {
        setUploadStates((prev) => new Map(prev).set(set.id, 'uploading'))
        try {
          const formData = new FormData()
          formData.append('file', file!)
          const res = await fetch(`/api/staging-sets/${set.id}/cover`, {
            method: 'POST',
            body: formData,
          })
          const data = await res.json() as { url?: string }
          if (data.url) {
            results.push({ id: set.id, url: data.url })
            setUploadStates((prev) => new Map(prev).set(set.id, 'done'))
          } else {
            setUploadStates((prev) => new Map(prev).set(set.id, 'error'))
          }
        } catch {
          setUploadStates((prev) => new Map(prev).set(set.id, 'error'))
        }
      }),
    )

    setIsUploading(false)
    setIsDone(true)
    onBatchUploaded(results)
  }, [includedMatches, isUploading, onBatchUploaded])

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setFiles([])
      setIncluded(new Set())
      setUploadStates(new Map())
      setIsUploading(false)
      setIsDone(false)
    }
  }, [open])

  const matchedCount = matches.filter((m) => m.file !== null).length
  const doneCount = Array.from(uploadStates.values()).filter((s) => s === 'done').length
  const errorCount = Array.from(uploadStates.values()).filter((s) => s === 'error').length

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isUploading) onClose() }}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/50 px-6 py-4">
          <DialogTitle>Batch Cover Upload</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">

          {/* Cover type toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Cover type:</span>
            <div className="flex overflow-hidden rounded-md border border-border">
              {(['photo', 'video'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={isUploading}
                  onClick={() => setSetType(t)}
                  className={cn(
                    'px-4 py-1.5 text-sm font-medium transition-colors',
                    setType === t
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {t === 'photo' ? 'Photo' : 'Video'}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {setsForType.length} set{setsForType.length !== 1 ? 's' : ''} missing covers
            </span>
          </div>

          {/* Drop zone */}
          <div
            {...dropProps}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 text-center transition-colors',
              isDragOver
                ? 'border-primary bg-primary/10'
                : 'border-border/50 hover:border-primary/40',
              isUploading && 'pointer-events-none opacity-50',
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
            />
            <Upload size={24} className="text-muted-foreground/40" />
            {files.length === 0 ? (
              <>
                <p className="text-sm font-medium">
                  Drop {setType} covers here or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  Files are matched to {setType} sets by ExternalID in the filename
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">{files.length} file{files.length !== 1 ? 's' : ''} loaded</p>
                <p className="text-xs text-muted-foreground">
                  {matchedCount} matched · {unmatchedFiles.length} unmatched · drop more to replace
                </p>
              </>
            )}
          </div>

          {/* Match table */}
          {files.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  {setType === 'photo' ? 'Photo' : 'Video'} sets ({setsForType.length}) matched against {files.length} file{files.length !== 1 ? 's' : ''}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {includedMatches.length} selected for upload
                </span>
              </div>

              <div className="overflow-hidden rounded-lg border border-border/50">
                {/* Matched rows */}
                {matches.filter((m) => m.file !== null).map(({ set, file, confidence }) => {
                  const status = uploadStates.get(set.id)
                  const isIncluded = included.has(set.id)
                  return (
                    <div
                      key={set.id}
                      className={cn(
                        'flex items-center gap-3 border-b border-border/30 px-3 py-2.5 last:border-0',
                        !isIncluded && 'opacity-50',
                      )}
                    >
                      {/* Checkbox / status */}
                      <button
                        type="button"
                        onClick={() => !isUploading && !status && toggleIncluded(set.id)}
                        disabled={isUploading || !!status}
                        className="shrink-0 text-muted-foreground"
                      >
                        {status === 'uploading' && <Loader2 size={16} className="animate-spin text-primary" />}
                        {status === 'done' && <CheckCircle2 size={16} className="text-green-500" />}
                        {status === 'error' && <XCircle size={16} className="text-destructive" />}
                        {!status && (isIncluded
                          ? <Check size={16} className="text-primary" />
                          : <Circle size={16} />
                        )}
                      </button>

                      {/* Set info */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{set.title}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {set.externalId} · {set.channelName}
                          {set.releaseDate && ` · ${new Date(set.releaseDate).toISOString().split('T')[0]}`}
                        </p>
                      </div>

                      {/* Matched filename */}
                      <div className="hidden min-w-0 max-w-[220px] sm:block">
                        <p className="truncate text-right text-[11px] text-muted-foreground" title={file!.name}>
                          {file!.name}
                        </p>
                      </div>

                      {/* Confidence */}
                      <div className="shrink-0">
                        <ConfidenceBadge confidence={confidence} />
                      </div>
                    </div>
                  )
                })}

                {/* Unmatched sets */}
                {matches.filter((m) => m.file === null).map(({ set }) => (
                  <div
                    key={set.id}
                    className="flex items-center gap-3 border-b border-border/30 px-3 py-2.5 last:border-0 opacity-40"
                  >
                    <Circle size={16} className="shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{set.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {set.externalId ?? '—'} · {set.channelName}
                      </p>
                    </div>
                    <ConfidenceBadge confidence="none" />
                  </div>
                ))}
              </div>

              {/* Unmatched files */}
              {unmatchedFiles.length > 0 && (
                <div className="rounded-lg border border-border/30 bg-muted/30 px-3 py-2">
                  <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                    {unmatchedFiles.length} unmatched file{unmatchedFiles.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {unmatchedFiles.map((f) => (
                      <span
                        key={f.name}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                      >
                        {f.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Done summary */}
          {isDone && (
            <div className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-3 text-sm',
              errorCount > 0 ? 'bg-amber-500/10 text-amber-600' : 'bg-green-500/10 text-green-600',
            )}>
              {errorCount > 0
                ? <XCircle size={16} />
                : <CheckCircle2 size={16} />}
              {doneCount} uploaded successfully
              {errorCount > 0 && `, ${errorCount} failed`}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-border/50 px-6 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isUploading}>
            {isDone ? 'Close' : 'Cancel'}
          </Button>
          {!isDone && (
            <Button
              size="sm"
              onClick={handleUploadAll}
              disabled={includedMatches.length === 0 || isUploading}
            >
              {isUploading
                ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
                : <><Upload size={14} /> Upload {includedMatches.length} file{includedMatches.length !== 1 ? 's' : ''}</>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
