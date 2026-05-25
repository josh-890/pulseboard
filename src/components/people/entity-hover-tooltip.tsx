"use client";

import Image from "next/image";
import { focalStyle, cn } from "@/lib/utils";

// Phase G Slice 14 / project_identity_bearing_ui ("Hover tooltip"):
// shared bounded preview shown when hovering a body-map region (and any
// future surface that opts in). Layout is fixed-size to prevent reflow
// flicker on rapid hover-out.
//
// Per the design memo:
//  - ~280px wide, ~120px max height per row, multiple rows for clustered
//    entities in a region.
//  - Left: square ~64px thumbnail, focal-cropped via MediaItem variants.
//  - Right: type pill, region label, truncated description.
//  - No-image fallback: quiet text-only row, no placeholder icon.
//  - Click anywhere on a tooltip row → scroll/highlight matching list row.

export type EntityTooltipThumbnail = {
  url: string;
  width: number;
  height: number;
  focalX: number | null;
  focalY: number | null;
};

export type EntityTooltipItem = {
  id: string;
  type: string;
  category: "mark" | "modification";
  regionLabel: string;
  description: string | null;
  status: "present" | "modified" | "removed" | "overgrown";
  thumbnail?: EntityTooltipThumbnail;
};

type Props = {
  items: EntityTooltipItem[];
  onItemClick?: (id: string) => void;
};

export function EntityHoverTooltip({ items, onItemClick }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="w-[280px] overflow-hidden rounded-lg border border-white/15 bg-card/95 shadow-lg backdrop-blur-md">
      <ul className="divide-y divide-white/10">
        {items.map((entity) => {
          const isRemoved = entity.status === "removed";
          const isMark = entity.category === "mark";
          const dotClass = isMark
            ? isRemoved
              ? "border border-amber-500 bg-transparent"
              : "border border-amber-500 bg-amber-500"
            : isRemoved
              ? "border border-teal-500 bg-transparent"
              : "border border-teal-500 bg-teal-500";

          const content = (
            <div className="flex items-stretch gap-2 p-2">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted/40">
                {entity.thumbnail ? (
                  <Image
                    src={entity.thumbnail.url}
                    alt=""
                    width={entity.thumbnail.width}
                    height={entity.thumbnail.height}
                    unoptimized
                    className="h-full w-full object-cover"
                    style={focalStyle(entity.thumbnail.focalX, entity.thumbnail.focalY)}
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground/40">
                    no photo
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClass)} aria-hidden="true" />
                  <span className={cn(
                    "truncate font-medium capitalize",
                    isRemoved ? "text-muted-foreground/60 line-through" : "text-foreground",
                  )}>
                    {entity.type}
                  </span>
                </div>
                <p className={cn(
                  "truncate text-[11px]",
                  isRemoved ? "text-muted-foreground/50" : "text-muted-foreground",
                )}>
                  {entity.regionLabel}
                </p>
                {entity.description && (
                  <p className={cn(
                    "line-clamp-2 text-[11px]",
                    isRemoved ? "text-muted-foreground/40" : "text-muted-foreground/70",
                  )}>
                    {entity.description}
                  </p>
                )}
              </div>
            </div>
          );

          return (
            <li key={entity.id}>
              {onItemClick ? (
                <button
                  type="button"
                  onClick={() => onItemClick(entity.id)}
                  className="block w-full text-left transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none"
                >
                  {content}
                </button>
              ) : (
                <div>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
