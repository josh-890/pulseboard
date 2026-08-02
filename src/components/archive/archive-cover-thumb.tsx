'use client'

import { useState, useTransition } from 'react'
import { Camera, Film, ImageOff, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHoverImagePreview, HoverImagePreview } from '@/components/shared/hover-image-preview'
import { clearArchiveCoverAction } from '@/lib/actions/archive-actions'

type ArchiveCoverThumbProps = {
  folderId: string
  coverUrl: string | null
  coverError: string | null
  isVideo: boolean
  folderName: string
  className?: string
}

/**
 * Leading cell of an archive leaf row. Takes the slot the bare type icon used to
 * occupy, so the tree layout is unchanged — the point of the cover work is to
 * make folders judgeable at a glance without flattening the channel/year tree
 * that makes 34k leaves navigable in the first place.
 *
 * Three states, all the same size so rows never jump:
 *   cover        → the thumbnail
 *   cover failed → a muted warning marker; the reason is in the tooltip, and the
 *                  actionable list lives in the Archive Cover maintenance check
 *   neither      → the original type icon (not yet attempted)
 */
export function ArchiveCoverThumb({
  folderId,
  coverUrl: initialCoverUrl,
  coverError,
  isVideo,
  folderName,
  className,
}: ArchiveCoverThumbProps) {
  // Local so the row updates immediately; the deletion is persisted server-side
  // and the folder simply reappears in the agent's worklist.
  const [cleared, setCleared] = useState(false)
  const [pending, startTransition] = useTransition()
  const coverUrl = cleared ? null : initialCoverUrl

  const { ref, hover, pos, show, hide } = useHoverImagePreview(coverUrl)

  function handleClear(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    startTransition(async () => {
      const res = await clearArchiveCoverAction(folderId)
      if (res.success) setCleared(true)
    })
  }

  const box = cn(
    'relative flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md',
    className,
  )

  if (coverUrl) {
    return (
      <div ref={ref} className={cn(box, 'group/cover bg-muted/40 ring-1 ring-border/40', pending && 'opacity-50')}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {/* Plain <img> (repo convention for MinIO-served media): the key is served
            directly and these are already 512px thumbnails, so next/image would add
            a loader without adding anything. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
        {isVideo && (
          <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-0.5 text-white">
            <Film size={9} />
          </span>
        )}
        {/* Delete sits ON the thumbnail so the mouse never leaves it — the same
            reason the staging row keeps its rotate control there. Removing the
            cover puts the folder back in the agent's worklist, which is how a
            wrong cover gets replaced (no force flag, no bulk re-upload). */}
        <button
          type="button"
          onClick={handleClear}
          disabled={pending}
          title="Remove this cover — the next cover run will fetch it again"
          aria-label={`Remove the cover of ${folderName}`}
          className="absolute inset-x-0 bottom-0 flex justify-center bg-black/55 py-0.5 text-white opacity-0 transition-opacity hover:bg-black/75 focus-visible:opacity-100 group-hover/cover:opacity-100 disabled:opacity-40"
        >
          <Trash2 size={10} />
        </button>
        {hover && pos && <HoverImagePreview url={coverUrl} alt={folderName} pos={pos} />}
      </div>
    )
  }

  if (coverError) {
    return (
      <span
        className={cn(box, 'bg-orange-500/10 text-orange-500/70 ring-1 ring-orange-500/25')}
        title={`Cover could not be produced: ${coverError}`}
        aria-label={`Cover failed for ${folderName}: ${coverError}`}
      >
        <ImageOff size={14} />
      </span>
    )
  }

  return (
    <span
      className={cn(box, 'text-muted-foreground/60')}
      title="No cover yet — run the archive cover agent"
    >
      {isVideo ? <Film size={14} /> : <Camera size={14} />}
    </span>
  )
}
