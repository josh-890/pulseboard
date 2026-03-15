"use client";

import { useState, useCallback, useMemo } from "react";
import { Search, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  searchRegions,
  BODY_REGION_PRESETS,
  getRegionLabel,
} from "@/lib/constants/body-regions";
import { BodyOverview } from "./body-overview";
import { BodyRegionChips } from "./body-region-chips";
import { useBodyRegionState } from "./use-body-region-state";

type BodyRegionPickerProps = {
  value: string[];
  onChange: (regions: string[]) => void;
  mode?: "single" | "multi";
  className?: string;
};

export function BodyRegionPicker({
  value,
  onChange,
  mode = "multi",
  className,
}: BodyRegionPickerProps) {
  const state = useBodyRegionState({ value, onChange, mode });
  const [searchQuery, setSearchQuery] = useState("");

  const searchResults = useMemo(
    () => (searchQuery.length >= 2 ? searchRegions(searchQuery) : []),
    [searchQuery],
  );

  const handleSearchSelect = useCallback(
    (id: string) => {
      state.toggleRegion(id);
      setSearchQuery("");
    },
    [state],
  );

  const handlePreset = useCallback(
    (regionIds: string[]) => {
      if (mode === "single") {
        onChange(regionIds.slice(0, 1));
      } else {
        const newValue = [...new Set([...value, ...regionIds])];
        onChange(newValue);
      }
    },
    [value, onChange, mode],
  );

  return (
    <div className={cn("space-y-3", className)}>
      {/* Controls: Front/Back toggle */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-white/15 overflow-hidden">
          <button
            type="button"
            onClick={() => state.setSide("front")}
            className={cn(
              "px-2.5 py-1 text-xs font-medium transition-colors",
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
              "px-2.5 py-1 text-xs font-medium transition-colors border-l border-white/15",
              state.side === "back"
                ? "bg-amber-500/20 text-amber-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Back
          </button>
        </div>

        {value.length > 0 && (
          <button
            type="button"
            onClick={state.clearAll}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw size={12} />
            Clear
          </button>
        )}
      </div>

      {/* Search + Body map side-by-side */}
      <div className="flex gap-3">
        {/* SVG Body map */}
        <div className="relative w-52 h-96 shrink-0 rounded-lg border border-white/10 bg-card/30 overflow-hidden">
          <BodyOverview
            side={state.side}
            selected={state.selected}
            hovered={state.hoveredRegion}
            onRegionClick={state.toggleRegion}
            onRegionHover={state.setHoveredRegion}
            onSubRegionSelect={state.toggleSubRegion}
          />

          {/* Hovered region tooltip */}
          {state.hoveredRegion && (
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-md bg-background/90 border border-white/15 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap pointer-events-none">
              {getRegionLabel(state.hoveredRegion)}
            </div>
          )}
        </div>

        {/* Search + Presets */}
        <div className="flex-1 space-y-2">
          {/* Search input */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search regions..."
              className="w-full rounded-lg border border-white/15 bg-muted/30 pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Search results dropdown */}
          {searchResults.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-lg border border-white/15 bg-card/60 backdrop-blur-sm">
              {searchResults.slice(0, 10).map((region) => (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => handleSearchSelect(region.id)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-sm hover:bg-white/5 transition-colors",
                    value.includes(region.id) && "text-amber-400",
                  )}
                >
                  {region.label}
                  {region.isSubRegion && (
                    <span className="ml-1 text-[10px] text-muted-foreground/50">(detail)</span>
                  )}
                  {value.includes(region.id) && (
                    <span className="ml-1 text-xs text-amber-500">(selected)</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Presets (only in multi mode) */}
          {mode === "multi" && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Presets</p>
              <div className="flex flex-wrap gap-1">
                {BODY_REGION_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePreset(preset.regionIds)}
                    className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground hover:border-amber-500/30 hover:text-amber-400 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Help text */}
          <p className="text-[10px] text-muted-foreground/50">
            Click regions on the body map or search above.
            {mode === "multi" && " Select multiple regions for large items."}
          </p>
        </div>
      </div>

      {/* Selected chips */}
      <BodyRegionChips
        regions={value}
        onRemove={state.removeRegion}
        onClear={mode === "multi" ? state.clearAll : undefined}
      />
    </div>
  );
}
