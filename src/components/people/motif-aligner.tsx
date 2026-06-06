'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, RotateCcw, Save, X, AlertTriangle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { computeSimilarityTransform, type Pt } from '@/lib/image/similarity-transform'
import { assignMotifImageAction } from '@/lib/actions/motif-template-actions'
import type { MotifTemplateRecord } from '@/lib/services/motif-template-service'

type MotifAlignerProps = {
  /** Source image — must expose the full-quality master URL + its MediaItem id. */
  source: { id: string; url: string }
  template: MotifTemplateRecord
  personId: string
  referenceSessionId: string
  /** Re-open: previously clicked source-pixel points keyed by keypoint name. */
  initialPoints?: Record<string, Pt>
  onSaved: () => void
  onCancel: () => void
}

const PREVIEW_H = 520

export function MotifAligner({
  source,
  template,
  personId,
  referenceSessionId,
  initialPoints,
  onSaved,
  onCancel,
}: MotifAlignerProps) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const srcCanvasRef = useRef<HTMLCanvasElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  const [loaded, setLoaded] = useState(false)
  const [points, setPoints] = useState<Record<string, Pt>>(initialPoints ?? {})
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Output (bake) geometry from the template.
  const { bakeW, bakeH } = useMemo(() => {
    const portrait = template.aspectH >= template.aspectW
    return portrait
      ? { bakeH: template.bakeLongSide, bakeW: Math.round((template.bakeLongSide * template.aspectW) / template.aspectH) }
      : { bakeW: template.bakeLongSide, bakeH: Math.round((template.bakeLongSide * template.aspectH) / template.aspectW) }
  }, [template])

  const orderedKps = template.keypoints
  const nextKp = orderedKps.find((k) => !points[k.name]) ?? null
  const allPlaced = orderedKps.length >= 2 && orderedKps.every((k) => points[k.name])

  // Load the source master.
  useEffect(() => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imgRef.current = img
      setLoaded(true)
    }
    img.src = source.url
  }, [source.url])

  // Draw source + placed markers.
  useEffect(() => {
    if (!loaded) return
    const img = imgRef.current
    const canvas = srcCanvasRef.current
    if (!img || !canvas) return
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const r = Math.max(6, Math.round(Math.max(img.naturalWidth, img.naturalHeight) * 0.006))
    ctx.lineWidth = Math.max(2, r / 3)
    orderedKps.forEach((k, i) => {
      const p = points[k.name]
      if (!p) return
      ctx.strokeStyle = '#22D3EE'
      ctx.fillStyle = 'rgba(34,211,238,0.25)'
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#22D3EE'
      ctx.font = `${r * 2}px sans-serif`
      ctx.fillText(String(i + 1), p.x + r, p.y - r)
    })
  }, [loaded, points, orderedKps])

  // Compute the fit once all keypoints are placed.
  const fit = useMemo(() => {
    if (!allPlaced) return null
    const src: Pt[] = orderedKps.map((k) => points[k.name])
    const dst: Pt[] = orderedKps.map((k) => ({ x: k.x * bakeW, y: k.y * bakeH }))
    try {
      return computeSimilarityTransform(src, dst)
    } catch {
      return null
    }
  }, [allPlaced, orderedKps, points, bakeW, bakeH])

  // Upscale guard: the source region sampled into the frame.
  const upscaleWarning = useMemo(() => {
    if (!fit) return null
    const srcRegionLong = template.bakeLongSide / fit.scale
    const min = template.minSourcePx ?? template.bakeLongSide
    if (fit.scale > 1.02 || srcRegionLong < min) {
      return `Source region ≈ ${Math.round(srcRegionLong)}px for a ${template.bakeLongSide}px output — result may be soft.`
    }
    return null
  }, [fit, template])

  // Render the live preview at PREVIEW_H.
  const previewW = Math.round((PREVIEW_H * bakeW) / bakeH)
  useEffect(() => {
    const canvas = previewCanvasRef.current
    const img = imgRef.current
    if (!canvas) return
    canvas.width = previewW
    canvas.height = PREVIEW_H
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (fit && img) {
      const s = PREVIEW_H / bakeH
      const m = fit.matrix
      ctx.save()
      ctx.setTransform(s * m.a, s * m.b, s * m.c, s * m.d, s * m.e, s * m.f)
      ctx.drawImage(img, 0, 0)
      ctx.restore()
    }
    // Target markers
    for (const k of orderedKps) {
      ctx.beginPath()
      ctx.arc(k.x * previewW, k.y * PREVIEW_H, 5, 0, Math.PI * 2)
      ctx.strokeStyle = '#F59E0B'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }, [fit, previewW, bakeH, orderedKps])

  const handleSrcClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!nextKp) return
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height
    setPoints((prev) => ({ ...prev, [nextKp.name]: { x, y } }))
  }, [nextKp])

  const reset = useCallback(() => { setPoints({}); setError(null) }, [])

  const handleSave = useCallback(async () => {
    const img = imgRef.current
    if (!fit || !img) return
    setIsSaving(true)
    setError(null)
    try {
      const out = document.createElement('canvas')
      out.width = bakeW
      out.height = bakeH
      const ctx = out.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, bakeW, bakeH)
      const m = fit.matrix
      ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f)
      ctx.drawImage(img, 0, 0)
      ctx.setTransform(1, 0, 0, 1, 0, 0)

      const blob: Blob | null = await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.92))
      if (!blob) throw new Error('Failed to render image')
      const file = new File([blob], `motif-${template.slot}-${Date.now()}.jpg`, { type: 'image/jpeg' })

      const upload = async (accept?: boolean) => {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('sessionId', referenceSessionId)
        fd.append('personId', personId)
        fd.append('isAnnotation', 'true')
        if (accept) fd.append('duplicateAction', 'accept')
        const r = await fetch('/api/media/upload', { method: 'POST', body: fd })
        return (await r.json()) as { mediaItem?: { id: string }; duplicateFound?: boolean }
      }
      let json = await upload()
      if (json.duplicateFound && !json.mediaItem) json = await upload(true)
      const mediaItemId = json.mediaItem?.id
      if (!mediaItemId) throw new Error('Upload failed')

      const provenance = { sourceMediaItemId: source.id, points, matrix: fit.matrix }
      const res = await assignMotifImageAction(personId, mediaItemId, template.slot, template.id, provenance)
      if (!res.success) throw new Error(res.error ?? 'Assign failed')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  }, [fit, bakeW, bakeH, template, referenceSessionId, personId, source.id, points, onSaved])

  if (typeof document === 'undefined') return null
  // Portal to <body> so the full-screen overlay isn't trapped by an ancestor's
  // backdrop-filter/transform containing block (e.g. the Slot Manager card).
  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-950">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-2">
        <button onClick={onCancel} className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white">
          <X size={16} />
        </button>
        <span className="text-sm font-medium text-zinc-200">Standardize: {template.name} (Slot {template.slot})</span>
        <span className="text-xs text-zinc-400">
          {nextKp ? `Click the ${nextKp.name.replace(/_/g, ' ')}` : 'All points placed — review the preview'}
        </span>
        <button onClick={reset} title="Reset points" className="ml-2 rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white">
          <RotateCcw size={15} />
        </button>
        <button
          onClick={handleSave}
          disabled={!allPlaced || !fit || isSaving}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Save to slot
        </button>
      </div>

      {(upscaleWarning || error) && (
        <div className={cn('flex items-center gap-2 px-4 py-1.5 text-xs', error ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300')}>
          <AlertTriangle size={13} /> {error ?? upscaleWarning}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4 overflow-auto p-4">
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {orderedKps.map((k, i) => (
              <span
                key={k.name}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]',
                  points[k.name] ? 'bg-cyan-500/20 text-cyan-300' : nextKp?.name === k.name ? 'bg-indigo-600 text-white' : 'bg-white/5 text-zinc-400',
                )}
              >
                {points[k.name] && <Check size={10} />}{i + 1}. {k.name.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
          <canvas
            ref={srcCanvasRef}
            onClick={handleSrcClick}
            className="max-h-[calc(100vh-160px)] max-w-full cursor-crosshair rounded-lg border border-white/10 object-contain"
          />
        </div>
        <div className="flex shrink-0 flex-col items-center">
          <span className="mb-2 text-[11px] text-zinc-400">Preview ({template.aspectW}:{template.aspectH})</span>
          <canvas ref={previewCanvasRef} className="rounded-lg border border-amber-500/30" style={{ height: PREVIEW_H, width: previewW }} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
