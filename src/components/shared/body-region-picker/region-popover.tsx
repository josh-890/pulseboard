"use client";

import { useRef, useEffect, useLayoutEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getSubRegions, getRegionShortLabel } from "@/lib/constants/body-regions";

type RegionPopoverProps = {
  regionId: string;
  selected: string[];
  side: "front" | "back";
  onSelect: (id: string) => void;
  onSelectParent: (id: string) => void;
  onClose: () => void;
  position: { x: number; y: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
};

export function RegionPopover({
  regionId,
  selected,
  side,
  onSelect,
  onSelectParent,
  onClose,
  position,
  containerRef,
}: RegionPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const allSubs = getSubRegions(regionId);
  const subRegions = allSubs.filter((s) => !s.view || s.view === "both" || s.view === side);

  // The body container clips its overflow, so a popover placed below a click
  // near the bottom of the body (e.g. ankles) gets cut off. After the first
  // render we measure the popover and flip it above the click if it would
  // extend past the container. `null` means "not measured yet"; render hidden
  // until then so the user doesn't see a one-frame jump.
  const [placement, setPlacement] = useState<{ flipV: boolean; flipH: "none" | "left" | "right" } | null>(null);

  useLayoutEffect(() => {
    if (!ref.current || !containerRef.current) {
      setPlacement({ flipV: false, flipH: "none" });
      return;
    }
    const popover = ref.current.getBoundingClientRect();
    const container = containerRef.current.getBoundingClientRect();
    const flipV = popover.bottom > container.bottom - 4;
    const flipH: "none" | "left" | "right" =
      popover.right > container.right - 4
        ? "right"
        : popover.left < container.left + 4
          ? "left"
          : "none";
    setPlacement({ flipV, flipH });
  }, [containerRef, regionId]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    // Use a small delay to prevent the same click from closing
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose, containerRef]);

  if (subRegions.length === 0) return null;

  const flipV = placement?.flipV ?? false;
  const flipH = placement?.flipH ?? "none";
  const tx =
    flipH === "right" ? "calc(-100% + 8px)" : flipH === "left" ? "-8px" : "-50%";
  const ty = flipV ? "calc(-100% - 4px)" : "4px";
  const style: React.CSSProperties = {
    position: "absolute",
    left: `${position.x}px`,
    top: `${position.y}px`,
    transform: `translate(${tx}, ${ty})`,
    zIndex: 60,
    visibility: placement == null ? "hidden" : "visible",
  };

  return (
    <div ref={ref} style={style}>
      <div className="rounded-lg border border-white/15 bg-background/95 backdrop-blur-md shadow-xl p-1.5 min-w-[120px] max-w-[200px]">
        <div className="flex flex-wrap gap-1 mb-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectParent(regionId);
            }}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
              selected.includes(regionId)
                ? "border-amber-500/40 bg-amber-500/20 text-amber-400"
                : "border-white/10 text-muted-foreground hover:border-amber-500/30 hover:text-amber-400",
            )}
          >
            {getRegionShortLabel(regionId)} (all)
          </button>
        </div>
        <p className="text-[9px] font-medium text-muted-foreground/60 uppercase tracking-wider px-1 mb-1">
          Refine
        </p>
        <div className="flex flex-wrap gap-1">
          {subRegions.map((sub) => {
            const isSelected = selected.includes(sub.id);
            return (
              <button
                key={sub.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(sub.id);
                }}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                  isSelected
                    ? "border-amber-500/40 bg-amber-500/20 text-amber-400"
                    : "border-white/10 text-muted-foreground hover:border-amber-500/30 hover:text-amber-400",
                )}
              >
                {sub.shortLabel}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
