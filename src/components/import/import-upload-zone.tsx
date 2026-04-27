'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ImportCompleteModal } from './import-complete-modal'
import type { StagingIngestSummary } from '@/lib/services/import/staging-service'

type CompletedUpload = {
  id: string
  subjectName: string
  summary: StagingIngestSummary
}

export function ImportUploadZone() {
  const router = useRouter()
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState<CompletedUpload | null>(null)

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null)
      setIsUploading(true)

      try {
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch('/api/import/upload', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Upload failed')
        }

        const data = await res.json()
        setIsUploading(false)
        if (data.stagingSummary) {
          setCompleted({ id: data.id, subjectName: data.subjectName, summary: data.stagingSummary })
        } else {
          router.push(`/import/${data.id}`)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
        setIsUploading(false)
      }
    },
    [router],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleUpload(file)
    },
    [handleUpload],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleUpload(file)
    },
    [handleUpload],
  )

  return (
    <>
      <div
        className={cn(
          'relative rounded-xl border-2 border-dashed p-5 text-center transition-colors',
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-border/50 hover:border-border',
          isUploading && 'pointer-events-none opacity-60',
        )}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragOver(true)
        }}
        onDragLeave={(e) => {
          // Only reset when leaving the outer container, not when entering children
          if (e.currentTarget.contains(e.relatedTarget as Node)) return
          setIsDragOver(false)
        }}
        onDrop={handleDrop}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Parsing file and matching entities...
            </p>
          </div>
        ) : (
          <>
            {/* Drop overlay — covers label to prevent native file-input hijack during drag */}
            {isDragOver && (
              <div className="absolute inset-0 z-10" />
            )}
            <label className="flex cursor-pointer flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                {isDragOver ? (
                  <FileText size={24} className="text-primary" />
                ) : (
                  <Upload size={24} className="text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium">
                  {isDragOver ? 'Drop file to import' : 'Drop a person data file here'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Format: YYYY-MM-DD_Name_(ICG-ID)
                </p>
              </div>
              <input
                type="file"
                className="hidden"
                onChange={handleFileInput}
                accept="*"
              />
            </label>
          </>
        )}

        {error && (
          <p className="mt-3 text-sm text-destructive">{error}</p>
        )}
      </div>

      {completed && (
        <ImportCompleteModal
          batchId={completed.id}
          subjectName={completed.subjectName}
          summary={completed.summary}
          onClose={() => setCompleted(null)}
        />
      )}
    </>
  )
}
