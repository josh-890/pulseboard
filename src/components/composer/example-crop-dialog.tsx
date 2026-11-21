"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { aspectOf, boxFromCorners, cropFromBox, type Box, type Framing } from "@/lib/tag-example";
import { TagExampleImage } from "./tag-example-image";
import { tileAspectClass } from "./composer-path-style";

export type ExampleCropDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tagName: string;
  photo: { viewUrl: string; width: number; height: number };
  /** "3:4" or "1:1" — the tile's shape */
  tileAspect: string;
  /** The path's rule: how much of the tile the subject fills, and where */
  framing: Framing;
  initialBox?: Box | null;
  busy: boolean;
  onSave: (box: Box) => void;
};

const pct = (v: number) => `${v * 100}%`;

/**
 * Frame an example the comparable way (ADR-0042, S4): draw a box tightly around
 * the subject — the whole person, the face, the garment. The path's rule makes
 * the crop (dashed), so every tile of the path shows its subject at the same
 * size; the tile on the right shows the result. Draw again to replace the box.
 */
export function ExampleCropDialog({ open, onOpenChange, tagName, photo, tileAspect, framing, initialBox, busy, onSave }: ExampleCropDialogProps) {
  const imageAspect = photo.width / Math.max(1, photo.height);
  const tile = aspectOf(tileAspect);
  const [box, setBox] = useState<Box | null>(initialBox ?? null);
  const areaRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const at = (e: React.PointerEvent) => {
    const r = areaRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const crop = box ? cropFromBox(box, imageAspect, tile, framing) : null;
  const drawable = !!box && box.w >= 0.01 && box.h >= 0.01;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" onKeyDown={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Example for {tagName}</DialogTitle>
          <DialogDescription>
            Draw a box tightly around the subject — the whole person, the face, or the garment. The tile is framed from
            it the same way for every example.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center">
          <div
            ref={areaRef}
            className="relative w-fit cursor-crosshair touch-none select-none overflow-hidden rounded-md bg-black"
            onPointerDown={(e) => {
              e.preventDefault();
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              const p = at(e);
              start.current = p;
              setBox({ x: p.x, y: p.y, w: 0, h: 0 });
            }}
            onPointerMove={(e) => {
              if (!start.current) return;
              const p = at(e);
              setBox(boxFromCorners(start.current.x, start.current.y, p.x, p.y));
            }}
            onPointerUp={() => (start.current = null)}
            data-testid="example-crop-box"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- MinIO URL */}
            <img src={photo.viewUrl} alt="" draggable={false} className="block max-h-[60vh] min-h-48 w-auto min-w-48 max-w-full" />
            {crop && drawable && (
              <div
                className="pointer-events-none absolute rounded-sm border-2 border-dashed border-white/80"
                style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }}
                aria-hidden
              />
            )}
            {box && (
              <div
                className="pointer-events-none absolute border-2 border-primary bg-primary/10"
                style={{ left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h) }}
                data-testid="example-subject-box"
                aria-hidden
              />
            )}
          </div>
          <div className="w-32 shrink-0 space-y-1 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tile</p>
            {crop && drawable ? (
              <TagExampleImage url={photo.viewUrl} crop={crop} className={`${tileAspectClass(tileAspect)} w-full rounded-md ring-1 ring-border`} />
            ) : (
              <div className={`${tileAspectClass(tileAspect)} flex w-full items-center justify-center rounded-md border border-dashed border-border p-2 text-[11px] text-muted-foreground`}>
                Draw a box on the photo
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              The subject fills {Math.round(framing.fill * 100)} %{framing.topMargin !== undefined ? ", the head near the top" : ", centred"}.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => box && onSave(box)} disabled={busy || !drawable} className="gap-1.5" data-testid="example-crop-save">
            {busy && <Loader2 size={14} className="animate-spin" />}
            Save example
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
