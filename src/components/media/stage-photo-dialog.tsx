'use client'

import { Loader2, Copy, Crop, PenLine, X } from 'lucide-react'
import type { GalleryItem } from '@/lib/types'

type StagePhotoDialogProps = {
  item: GalleryItem
  entityLabel: string
  onSaveCopy: () => void
  onCrop: () => void
  onAnnotate: () => void
  onCancel: () => void
  isSaving: boolean
}

export function StagePhotoDialog({
  item,
  entityLabel,
  onSaveCopy,
  onCrop,
  onAnnotate,
  onCancel,
  isSaving,
}: StagePhotoDialogProps) {
  const thumbUrl =
    item.urls.gallery_512 ??
    item.urls.view_1200 ??
    item.urls.original ??
    ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="relative w-full max-w-sm rounded-xl border border-white/10 bg-zinc-900 p-5 shadow-2xl">
        {/* Close */}
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="absolute right-3 top-3 rounded-md p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-300 disabled:opacity-40"
        >
          <X size={15} />
        </button>

        <h2 className="mb-1 pr-6 text-sm font-semibold text-zinc-100">Save photo to reference</h2>
        <p className="mb-4 text-xs text-zinc-400">
          For <span className="text-zinc-200">{entityLabel}</span>
        </p>

        {/* Thumbnail */}
        {thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={item.filename}
            className="mb-4 max-h-48 w-full rounded-lg object-contain bg-zinc-800"
          />
        )}

        <p className="mb-4 text-xs text-zinc-400">
          Choose how to add this photo to the reference session:
        </p>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={onSaveCopy}
            disabled={isSaving}
            className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-left text-xs transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 size={15} className="shrink-0 animate-spin text-indigo-400" />
            ) : (
              <Copy size={15} className="shrink-0 text-indigo-400" />
            )}
            <span>
              <span className="block font-medium text-zinc-100">Save as copy</span>
              <span className="text-zinc-400">Add as-is to reference session</span>
            </span>
          </button>

          <button
            onClick={onCrop}
            disabled={isSaving}
            className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-left text-xs transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <Crop size={15} className="shrink-0 text-amber-400" />
            <span>
              <span className="block font-medium text-zinc-100">Crop first</span>
              <span className="text-zinc-400">Trim to a detail region, then save</span>
            </span>
          </button>

          <button
            onClick={onAnnotate}
            disabled={isSaving}
            className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-left text-xs transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <PenLine size={15} className="shrink-0 text-emerald-400" />
            <span>
              <span className="block font-medium text-zinc-100">Annotate</span>
              <span className="text-zinc-400">Add arrows or rectangles, then save</span>
            </span>
          </button>
        </div>

        <button
          onClick={onCancel}
          disabled={isSaving}
          className="mt-3 w-full text-center text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
