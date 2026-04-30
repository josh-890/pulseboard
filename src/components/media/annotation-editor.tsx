'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Crop, ArrowUpRight, Square, Circle, Minus, Undo2, RotateCcw, Save, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────────

type Tool = 'crop' | 'arrow' | 'line' | 'rect' | 'circle'

type Point = { x: number; y: number }

type Shape =
  | { type: 'arrow'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { type: 'rect'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { type: 'circle'; x1: number; y1: number; x2: number; y2: number; color: string }

const COLORS = [
  { value: '#EF4444', label: 'Red' },
  { value: '#F97316', label: 'Orange' },
  { value: '#EAB308', label: 'Yellow' },
  { value: '#22C55E', label: 'Green' },
  { value: '#FFFFFF', label: 'White' },
  { value: '#000000', label: 'Black' },
]

type AnnotationEditorProps = {
  /** URL of the source image to annotate */
  imageUrl: string
  onSave: (blob: Blob) => void
  onCancel: () => void
  isSaving?: boolean
  /** Start in a specific tool mode (applied after mount) */
  initialTool?: 'arrow' | 'crop'
}

const LINE_WIDTH = 3
const ARROW_HEAD_LEN = 14

// ─── Helpers ─────────────────────────────────────────────────────────────────

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(
    x2 - ARROW_HEAD_LEN * Math.cos(angle - Math.PI / 6),
    y2 - ARROW_HEAD_LEN * Math.sin(angle - Math.PI / 6),
  )
  ctx.moveTo(x2, y2)
  ctx.lineTo(
    x2 - ARROW_HEAD_LEN * Math.cos(angle + Math.PI / 6),
    y2 - ARROW_HEAD_LEN * Math.sin(angle + Math.PI / 6),
  )
  ctx.stroke()
}

function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

function drawRect(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)
}

function drawCircle(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2
  const rx = Math.abs(x2 - x1) / 2
  const ry = Math.abs(y2 - y1) / 2
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.stroke()
}

function drawShapes(ctx: CanvasRenderingContext2D, shapes: Shape[]) {
  ctx.lineWidth = LINE_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of shapes) {
    ctx.strokeStyle = s.color
    if (s.type === 'arrow') drawArrow(ctx, s.x1, s.y1, s.x2, s.y2)
    else if (s.type === 'line') drawLine(ctx, s.x1, s.y1, s.x2, s.y2)
    else if (s.type === 'rect') drawRect(ctx, s.x1, s.y1, s.x2, s.y2)
    else if (s.type === 'circle') drawCircle(ctx, s.x1, s.y1, s.x2, s.y2)
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AnnotationEditor({
  imageUrl,
  onSave,
  onCancel,
  isSaving = false,
  initialTool,
}: AnnotationEditorProps) {
  const [tool, setTool] = useState<Tool>(initialTool ?? 'arrow')
  const [color, setColor] = useState(COLORS[0].value)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [pendingCrop, setPendingCrop] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [dragStart, setDragStart] = useState<Point | null>(null)
  const [liveShape, setLiveShape] = useState<Shape | null>(null)

  // Two stacked canvases: imageCanvas (background) + overlayCanvas (annotations)
  const imageCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  // Scale factor: canvas-to-display ratio (for hi-DPI and resizing)
  const scaleRef = useRef({ x: 1, y: 1 })

  // Load and draw image
  useEffect(() => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imgRef.current = img
      const canvas = imageCanvasRef.current
      if (!canvas) return
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const overlay = overlayCanvasRef.current!
      overlay.width = img.naturalWidth
      overlay.height = img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
    }
    img.src = imageUrl
  }, [imageUrl])

  // Recompute scale when canvas size changes
  const updateScale = useCallback(() => {
    const canvas = imageCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width > 0) {
      scaleRef.current = {
        x: canvas.width / rect.width,
        y: canvas.height / rect.height,
      }
    }
  }, [])

  // Redraw overlay whenever shapes change
  const redrawOverlay = useCallback((extraShape?: Shape) => {
    const overlay = overlayCanvasRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')!
    ctx.clearRect(0, 0, overlay.width, overlay.height)
    drawShapes(ctx, shapes)
    if (extraShape) drawShapes(ctx, [extraShape])
    // Draw pending crop rect
    if (pendingCrop) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.setLineDash([6, 4])
      ctx.lineWidth = 2
      ctx.strokeRect(
        pendingCrop.x1, pendingCrop.y1,
        pendingCrop.x2 - pendingCrop.x1,
        pendingCrop.y2 - pendingCrop.y1,
      )
      ctx.setLineDash([])
    }
  }, [shapes, pendingCrop])

  useEffect(() => {
    redrawOverlay(liveShape ?? undefined)
  }, [shapes, liveShape, pendingCrop, redrawOverlay])

  // Convert client coords to canvas coords
  const toCanvas = useCallback((e: React.MouseEvent<HTMLCanvasElement>): Point => {
    updateScale()
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * scaleRef.current.x,
      y: (e.clientY - rect.top) * scaleRef.current.y,
    }
  }, [updateScale])

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = toCanvas(e)
    setDragStart(pt)
    setIsDrawing(true)
    if (tool === 'crop') {
      setPendingCrop({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y })
    }
  }, [tool, toCanvas])

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !dragStart) return
    const pt = toCanvas(e)
    if (tool === 'arrow') {
      setLiveShape({ type: 'arrow', x1: dragStart.x, y1: dragStart.y, x2: pt.x, y2: pt.y, color })
    } else if (tool === 'line') {
      setLiveShape({ type: 'line', x1: dragStart.x, y1: dragStart.y, x2: pt.x, y2: pt.y, color })
    } else if (tool === 'rect') {
      setLiveShape({ type: 'rect', x1: dragStart.x, y1: dragStart.y, x2: pt.x, y2: pt.y, color })
    } else if (tool === 'circle') {
      setLiveShape({ type: 'circle', x1: dragStart.x, y1: dragStart.y, x2: pt.x, y2: pt.y, color })
    } else if (tool === 'crop') {
      setPendingCrop({ x1: dragStart.x, y1: dragStart.y, x2: pt.x, y2: pt.y })
    }
  }, [isDrawing, dragStart, tool, color, toCanvas])

  const onMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !dragStart) return
    const pt = toCanvas(e)
    setIsDrawing(false)
    setLiveShape(null)
    setDragStart(null)
    if (tool === 'arrow') {
      setShapes((prev) => [...prev, { type: 'arrow', x1: dragStart.x, y1: dragStart.y, x2: pt.x, y2: pt.y, color }])
    } else if (tool === 'line') {
      setShapes((prev) => [...prev, { type: 'line', x1: dragStart.x, y1: dragStart.y, x2: pt.x, y2: pt.y, color }])
    } else if (tool === 'rect') {
      setShapes((prev) => [...prev, { type: 'rect', x1: dragStart.x, y1: dragStart.y, x2: pt.x, y2: pt.y, color }])
    } else if (tool === 'circle') {
      setShapes((prev) => [...prev, { type: 'circle', x1: dragStart.x, y1: dragStart.y, x2: pt.x, y2: pt.y, color }])
    } else if (tool === 'crop') {
      setPendingCrop({ x1: dragStart.x, y1: dragStart.y, x2: pt.x, y2: pt.y })
    }
  }, [isDrawing, dragStart, tool, color, toCanvas])

  const applyCrop = useCallback(() => {
    if (!pendingCrop) return
    const imgCanvas = imageCanvasRef.current!
    const ctx = imgCanvas.getContext('2d')!
    const x = Math.min(pendingCrop.x1, pendingCrop.x2)
    const y = Math.min(pendingCrop.y1, pendingCrop.y2)
    const w = Math.abs(pendingCrop.x2 - pendingCrop.x1)
    const h = Math.abs(pendingCrop.y2 - pendingCrop.y1)
    if (w < 10 || h < 10) return

    // Get cropped image data
    const imageData = ctx.getImageData(x, y, w, h)

    // Resize canvas to crop region
    imgCanvas.width = w
    imgCanvas.height = h
    ctx.putImageData(imageData, 0, 0)

    // Resize overlay to match
    const overlay = overlayCanvasRef.current!
    overlay.width = w
    overlay.height = h

    // Shift all existing shapes by crop offset
    setShapes((prev) => prev.map((s) => ({
      ...s,
      x1: s.x1 - x,
      y1: s.y1 - y,
      x2: s.x2 - x,
      y2: s.y2 - y,
    })))

    setCropRect({ x, y, w, h })
    setPendingCrop(null)
    setTool('arrow')
  }, [pendingCrop])

  const undo = useCallback(() => {
    setShapes((prev) => prev.slice(0, -1))
  }, [])

  const reset = useCallback(() => {
    // Reload image
    const img = imgRef.current
    if (!img) return
    const canvas = imageCanvasRef.current!
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const overlay = overlayCanvasRef.current!
    overlay.width = img.naturalWidth
    overlay.height = img.naturalHeight
    setShapes([])
    setPendingCrop(null)
    setCropRect(null)
    setTool('arrow')
  }, [])

  const handleSave = useCallback(() => {
    const imgCanvas = imageCanvasRef.current!
    const overlay = overlayCanvasRef.current!

    // Auto-apply pending crop before saving (no "Apply crop" click needed)
    if (tool === 'crop' && pendingCrop) {
      const ctx = imgCanvas.getContext('2d')!
      const x = Math.min(pendingCrop.x1, pendingCrop.x2)
      const y = Math.min(pendingCrop.y1, pendingCrop.y2)
      const w = Math.abs(pendingCrop.x2 - pendingCrop.x1)
      const h = Math.abs(pendingCrop.y2 - pendingCrop.y1)
      if (w >= 10 && h >= 10) {
        const imageData = ctx.getImageData(x, y, w, h)
        imgCanvas.width = w
        imgCanvas.height = h
        ctx.putImageData(imageData, 0, 0)
        overlay.width = w
        overlay.height = h
      }
    }

    // Merge: draw overlay on top of image canvas
    const merged = document.createElement('canvas')
    merged.width = imgCanvas.width
    merged.height = imgCanvas.height
    const ctx = merged.getContext('2d')!
    ctx.drawImage(imgCanvas, 0, 0)
    ctx.drawImage(overlay, 0, 0)

    merged.toBlob(
      (blob) => { if (blob) onSave(blob) },
      'image/jpeg',
      0.92,
    )
  }, [onSave, tool, pendingCrop])

  const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'crop', icon: <Crop size={15} />, label: 'Crop' },
    { id: 'arrow', icon: <ArrowUpRight size={15} />, label: 'Arrow' },
    { id: 'line', icon: <Minus size={15} />, label: 'Line' },
    { id: 'rect', icon: <Square size={15} />, label: 'Rectangle' },
    { id: 'circle', icon: <Circle size={15} />, label: 'Circle' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2">
        <button
          onClick={onCancel}
          className="mr-1 rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"
        >
          <X size={16} />
        </button>

        <span className="text-xs font-medium text-zinc-400">Edit photo</span>

        <div className="mx-2 h-4 w-px bg-white/10" />

        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTool(t.id); setPendingCrop(null) }}
            title={t.label}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors',
              tool === t.id
                ? 'bg-indigo-600 text-white'
                : 'text-zinc-400 hover:bg-white/5 hover:text-white',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}

        {tool === 'crop' && pendingCrop && (
          <button
            onClick={applyCrop}
            className="rounded-md bg-amber-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
          >
            Apply crop
          </button>
        )}

        {tool !== 'crop' && (
          <>
            <div className="mx-2 h-4 w-px bg-white/10" />
            <div className="flex items-center gap-1">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  title={c.label}
                  className={cn(
                    'h-5 w-5 rounded-full border-2 transition-transform hover:scale-110',
                    color === c.value ? 'border-white scale-110' : 'border-transparent',
                    c.value === '#000000' && 'ring-1 ring-white/20',
                  )}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </>
        )}

        <div className="mx-2 h-4 w-px bg-white/10" />

        <button
          onClick={undo}
          disabled={shapes.length === 0}
          title="Undo last annotation"
          className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-30"
        >
          <Undo2 size={15} />
        </button>
        <button
          onClick={reset}
          title="Reset all changes"
          className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"
        >
          <RotateCcw size={15} />
        </button>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {tool === 'crop' ? 'Save crop' : 'Save annotation'}
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="relative flex flex-1 items-center justify-center overflow-auto bg-zinc-900 p-4"
      >
        <div className="relative max-h-full max-w-full">
          {/* Image canvas */}
          <canvas
            ref={imageCanvasRef}
            className="block max-h-[calc(100vh-80px)] max-w-full object-contain"
            style={{ cursor: tool === 'crop' ? 'crosshair' : 'crosshair' }}
          />
          {/* Overlay canvas — transparent, stacked on top for drawing */}
          <canvas
            ref={overlayCanvasRef}
            className="pointer-events-none absolute inset-0 max-h-[calc(100vh-80px)] max-w-full"
          />
          {/* Mouse event capture layer */}
          <canvas
            className="absolute inset-0 max-h-[calc(100vh-80px)] max-w-full cursor-crosshair opacity-0"
            ref={(el) => {
              if (!el || !imageCanvasRef.current) return
              el.width = imageCanvasRef.current.width
              el.height = imageCanvasRef.current.height
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />
        </div>
      </div>
    </div>
  )
}
