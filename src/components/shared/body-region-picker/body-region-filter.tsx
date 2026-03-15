"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { BodyOverview } from "./body-overview";
import { BodyRegionChips } from "./body-region-chips";
import { useBodyRegionState } from "./use-body-region-state";

type BodyRegionFilterProps = {
  selected: string[];
  onChange: (regions: string[]) => void;
  matchMode: "any" | "all";
  onMatchModeChange: (mode: "any" | "all") => void;
};

export function BodyRegionFilter({
  selected,
  onChange,
  matchMode,
  onMatchModeChange,
}: BodyRegionFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const state = useBodyRegionState({ value: selected, onChange, mode: "multi" });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const toggleOpen = useCallback(() => setOpen((o) => !o), []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggleOpen}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
          selected.length > 0
            ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
            : "border-white/15 text-muted-foreground hover:border-white/30",
        )}
      >
        <MapPin size={14} />
        Body Region
        {selected.length > 0 && (
          <span className="rounded-full bg-amber-500/20 px-1.5 text-xs font-medium">
            {selected.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-white/15 bg-background/95 backdrop-blur-md shadow-2xl p-3 space-y-3">
          {/* Side + Match mode toggles */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-white/15 overflow-hidden">
              <button
                type="button"
                onClick={() => state.setSide("front")}
                className={cn(
                  "px-2 py-0.5 text-[10px] font-medium transition-colors",
                  state.side === "front"
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Front
              </button>
              <button
                type="button"
                onClick={() => state.setSide("back")}
                className={cn(
                  "px-2 py-0.5 text-[10px] font-medium transition-colors border-l border-white/15",
                  state.side === "back"
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Back
              </button>
            </div>

            {/* Match mode */}
            <div className="ml-auto flex rounded-lg border border-white/15 overflow-hidden">
              <button
                type="button"
                onClick={() => onMatchModeChange("any")}
                className={cn(
                  "px-2 py-0.5 text-[10px] font-medium transition-colors",
                  matchMode === "any"
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Any
              </button>
              <button
                type="button"
                onClick={() => onMatchModeChange("all")}
                className={cn(
                  "px-2 py-0.5 text-[10px] font-medium transition-colors border-l border-white/15",
                  matchMode === "all"
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                All
              </button>
            </div>
          </div>

          {/* Mini body SVG */}
          <div className="mx-auto h-64 w-44 rounded-lg border border-white/5 bg-card/20 overflow-hidden">
            <BodyOverview
              side={state.side}
              selected={state.selected}
              hovered={state.hoveredRegion}
              onRegionClick={state.toggleRegion}
              onRegionHover={state.setHoveredRegion}
              onSubRegionSelect={state.toggleSubRegion}
            />
          </div>

          {/* Selected chips */}
          <BodyRegionChips
            regions={selected}
            onRemove={state.removeRegion}
            onClear={state.clearAll}
            compact
          />

          {/* Clear button */}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={state.clearAll}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}
