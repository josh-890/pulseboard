"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { aspectOf, defaultCrop, moveCrop, resizeCrop, type Crop } from "@/lib/tag-example";

export type ExampleCropDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tagName: string;
  photo: { viewUrl: string; width: number; height: number };
  /** "3:4" or "1:1" — the tile's shape, which the crop keeps */
  tileAspect: string;
  initialCrop?: Crop;
  busy: boolean;
  onSave: (crop: Crop) => void;
};

/**
 * Crop a photo to a tag's tile (ADR-0042, S4): a frame of the tile's shape over
 * the photo — drag it to move, drag its corner to resize, arrow keys nudge.
 * Stored as fractions of the photo; no image is generated. Mounted when opened,
 * so it always starts from `initialCrop` (or the largest centred frame).
 */
export function ExampleCropDialog({ open, onOpenChange, tagName, photo, tileAspect, initialCrop, busy, onSave }: ExampleCropDialogProps) {
  const imageAspect = photo.width / Math.max(1, photo.height);
  const tile = aspectOf(tileAspect);
  const [crop, setCrop] = useState<Crop>(() => initialCrop ?? defaultCrop(imageAspect, tile));
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: "move" | "resize"; x: number; y: number; start: Crop } | null>(null);

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const box = boxRef.current?.getBoundingClientRect();
    if (!d || !box) return;
    const dx = (e.clientX - d.x) / box.width;
    const dy = (e.clientY - d.y) / box.height;
    setCrop(d.kind === "move" ? moveCrop(d.start, dx, dy, imageAspect, tile) : resizeCrop(d.start, dx, imageAspect, tile));
  };
  const start = (kind: "move" | "resize") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, x: e.clientX, y: e.clientY, start: crop };
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    setCrop((c) => moveCrop(c, m[0], m[1], imageAspect, tile));
  };

  const pct = (v: number) => `${v * 100}%`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" onKeyDown={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Example for {tagName}</DialogTitle>
          <DialogDescription>Drag the frame to what shows the tag best; drag its corner to resize. Arrow keys nudge.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center">
          <div
            ref={boxRef}
            className="relative max-h-[65vh] select-none overflow-hidden rounded-md bg-black"
            onPointerMove={onPointerMove}
            onPointerUp={() => (drag.current = null)}
            data-testid="example-crop-box"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- MinIO URL */}
            <img src={photo.viewUrl} alt="" draggable={false} className="block max-h-[65vh] w-auto max-w-full" />
            <div className="pointer-events-none absolute inset-0 bg-black/50" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${pct(crop.x)} ${pct(crop.y)}, ${pct(crop.x)} ${pct(crop.y + crop.h)}, ${pct(crop.x + crop.w)} ${pct(crop.y + crop.h)}, ${pct(crop.x + crop.w)} ${pct(crop.y)}, ${pct(crop.x)} ${pct(crop.y)})` }} />
            <div
              role="group"
              tabIndex={0}
              aria-roledescription="crop frame"
              aria-label={`Example frame, ${Math.round(crop.x * 100)}% from the left, ${Math.round(crop.y * 100)}% from the top, ${Math.round(crop.w * 100)}% wide — arrow keys move it`}
              onKeyDown={onKeyDown}
              onPointerDown={start("move")}
              className="absolute cursor-move rounded-sm border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }}
              data-testid="example-crop-frame"
            >
              <span
                onPointerDown={start("resize")}
                className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border-2 border-white bg-primary"
                aria-hidden
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onSave(crop)} disabled={busy} className="gap-1.5" data-testid="example-crop-save">
            {busy && <Loader2 size={14} className="animate-spin" />}
            Save example
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
