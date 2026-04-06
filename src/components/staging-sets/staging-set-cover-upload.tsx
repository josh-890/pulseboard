'use client'

import { useCallback, useRef, useState } from 'react'
import Image from 'next/image'
import { Camera, Loader2, Upload } from 'lucide-react'
import { useFileDrop } from '@/lib/hooks/use-file-drop'
import { cn } from '@/lib/utils'

type StagingSetCoverUploadProps = {
  stagingSetId: string
  currentUrl: string | null
  onUploaded: (url: string) => void
}

export function StagingSetCoverUpload({
  stagingSetId,
  currentUrl,
  onUploaded,
}: StagingSetCoverUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/staging-sets/${stagingSetId}/cover`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.url) onUploaded(data.url)
    } catch {
      // Silently fail
    } finally {
      setIsUploading(false)
    }
  }, [stagingSetId, onUploaded])

  const onDropFiles = useCallback((files: FileList) => {
    if (files[0]) handleUpload(files[0])
  }, [handleUpload])

  const { isDragOver, dropProps } = useFileDrop(onDropFiles)

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) handleUpload(e.target.files[0])
          e.target.value = ''
        }}
      />

      <div
        {...dropProps}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'relative aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-lg border-2 border-dashed transition-colors',
          isDragOver
            ? 'border-primary bg-primary/10'
            : currentUrl
              ? 'border-transparent'
              : 'border-border/50 hover:border-primary/50',
        )}
      >
        {currentUrl ? (
          <>
            <Image
              src={currentUrl}
              alt="Cover"
              fill
              className="object-cover"
              unoptimized
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all hover:bg-black/40 hover:opacity-100">
              <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
                <Upload size={12} />
                Replace
              </span>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Camera size={24} className="opacity-30" />
            <span className="text-xs">
              {isDragOver ? 'Drop image here' : 'Drop cover image or click to browse'}
            </span>
          </div>
        )}

        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 size={20} className="animate-spin text-white" />
          </div>
        )}
      </div>
    </div>
  )
}
