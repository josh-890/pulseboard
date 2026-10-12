"use client";

import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { zoomTransform, type ZoomState } from "@/lib/comparison-zoom";
import type { ComparisonFitMode, ComparisonMember } from "@/lib/services/comparison-service";

// A comparison drawn as it was composed (ADR-0015): its member photos in a row of
// equal cells, each shaped like the aspect-driver, filled (COVER, kept on the focal
// point) or letterboxed (CONTAIN). The grid tile, the viewer and compose mode all
// draw through this, so what the grid shows is what opens.

export type ComparisonZoomMode = "synced" | "whole";

/** Cell shape (the aspect-driver's) and the whole row's width:height */
export function comparisonShape(members: ComparisonMember[]): { cellW: number; cellH: number; rowAspect: number } {
  const driver = members.find((m) => m.isAspectDriver) ?? members[0];
  const cellW = driver?.originalWidth || 2;
  const cellH = driver?.originalHeight || 3;
  return { cellW, cellH, rowAspect: (cellW * Math.max(1, members.length)) / cellH };
}

type FrameProps = {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
};

export type ComparisonCompositeProps = {
  members: ComparisonMember[];
  fitMode: ComparisonFitMode;
  /** Thumbnails for the grid, full views for the viewer */
  source: "thumb" | "view";
  zoom?: ZoomState;
  zoomMode?: ComparisonZoomMode;
  /** Zoom click/drag handlers — on each cell (synced) or on the row (whole) */
  frameProps?: FrameProps;
  cellOverlay?: (member: ComparisonMember, index: number) => React.ReactNode;
  onCellClick?: (member: ComparisonMember, e: React.MouseEvent<HTMLDivElement>) => void;
  className?: string;
};

export function ComparisonComposite({
  members,
  fitMode,
  source,
  zoom,
  zoomMode = "synced",
  frameProps,
  cellOverlay,
  onCellClick,
  className,
}: ComparisonCompositeProps) {
  const { rowAspect } = comparisonShape(members);
  const isCover = fitMode === "COVER";
  const zoomed = !!zoom && zoom.scale > 1;
  const transform = zoom ? zoomTransform(zoom) : undefined;
  const whole = zoomMode === "whole";

  return (
    <div
      className={cn("relative overflow-hidden bg-black", frameProps && (zoomed ? "cursor-grab" : "cursor-zoom-in"), className)}
      style={{ aspectRatio: `${rowAspect}` }}
      {...(whole ? frameProps : undefined)}
    >
      <div
        className="flex h-full w-full origin-top-left"
        style={whole && transform ? { transform } : undefined}
      >
        {members.map((m, i) => {
          const src =
            source === "thumb" ? m.thumbUrl : zoomed ? (m.zoomUrl ?? m.viewUrl) : (m.viewUrl ?? m.thumbUrl);
          return (
            <div
              key={m.mediaItemId}
              className={cn("relative h-full min-w-0 flex-1 overflow-hidden", i > 0 && "border-l-2 border-black")}
              onClick={onCellClick ? (e) => onCellClick(m, e) : undefined}
              {...(!whole ? frameProps : undefined)}
            >
              <div className="h-full w-full origin-top-left" style={!whole && transform ? { transform } : undefined}>
                {src ? (
                  <Image
                    src={src}
                    alt={`Photo ${i + 1} of ${members.length}`}
                    fill
                    unoptimized
                    draggable={false}
                    sizes={source === "thumb" ? "320px" : "100vw"}
                    className={cn("select-none", isCover ? "object-cover" : "object-contain")}
                    style={isCover ? { objectPosition: `${(m.focalX ?? 0.5) * 100}% ${(m.focalY ?? 0.5) * 100}%` } : undefined}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted">
                    <ImageIcon size={18} className="text-muted-foreground/40" />
                  </div>
                )}
              </div>
              {cellOverlay?.(m, i)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
