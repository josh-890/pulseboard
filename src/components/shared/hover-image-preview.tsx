'use client'

import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type PreviewPos = { top: number; left: number }

/**
 * Enlarged image preview on hover, anchored to a thumbnail.
 *
 * Rendered through a portal into document.body with `position: fixed`, which is
 * the load-bearing detail: both callers sit inside scrollable, virtualised
 * containers that would otherwise clip an absolutely-positioned preview. The top
 * is clamped so the preview never runs off the bottom of the viewport.
 *
 * Extracted from the staging-set row so the archive tree behaves identically —
 * "the same hover as in staged sets" is a promise a shared implementation keeps
 * and two copies do not.
 */
export function useHoverImagePreview(url: string | null) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [pos, setPos] = useState<PreviewPos | null>(null)

  const show = useCallback(() => {
    if (!ref.current || !url) return
    const rect = ref.current.getBoundingClientRect()
    // Max preview height ~400px + margin; keep it on screen.
    const maxTop = window.innerHeight - 420
    setPos({ top: Math.min(rect.top, Math.max(8, maxTop)), left: rect.right + 8 })
    setHover(true)
  }, [url])

  const hide = useCallback(() => setHover(false), [])

  return { ref, hover, pos, show, hide }
}

export function HoverImagePreview({
  url,
  alt,
  pos,
}: {
  url: string
  alt: string
  pos: PreviewPos
}) {
  return createPortal(
    <div
      // pointer-events-none: the preview must never steal the mouse from the
      // thumbnail, or hovering would flicker between show and hide.
      className="pointer-events-none fixed z-[100] overflow-hidden rounded-lg border border-border bg-background shadow-xl"
      style={{ top: pos.top, left: pos.left }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="block max-h-[400px] max-w-[300px]" />
    </div>,
    document.body,
  )
}
