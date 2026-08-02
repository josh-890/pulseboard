'use client'

import { Camera, Film, ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHoverImagePreview, HoverImagePreview } from '@/components/shared/hover-image-preview'

type ArchiveCoverThumbProps = {
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
  coverUrl,
  coverError,
  isVideo,
  folderName,
  className,
}: ArchiveCoverThumbProps) {
  const { ref, hover, pos, show, hide } = useHoverImagePreview(coverUrl)

  const box = cn(
    'relative flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md',
    className,
  )

  if (coverUrl) {
    return (
      <div ref={ref} className={cn(box, 'bg-muted/40 ring-1 ring-border/40')}
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
