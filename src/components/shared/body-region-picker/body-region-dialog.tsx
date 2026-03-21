"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { X, Search, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  searchRegions,
  BODY_REGION_PRESETS,
  getRegionLabel,
} from "@/lib/constants/body-regions";
import { BodyOverview } from "./body-overview";
import { BodyRegionChips } from "./body-region-chips";
import { useBodyRegionState } from "./use-body-region-state";

type BodyRegionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string[];
  onChange: (regions: string[]) => void;
  mode?: "single" | "multi";
};

export function BodyRegionDialog(props: BodyRegionDialogProps) {
  // Unmount content when closed so draft state resets naturally on next open
  if (!props.open) return null;
  return <BodyRegionDialogContent {...props} />;
}

function BodyRegionDialogContent({
  onOpenChange,
  value,
  onChange,
  mode = "multi",
}: BodyRegionDialogProps) {
  // Internal draft state — initializes from value, only committed on "Done"
  const [draft, setDraft] = useState<string[]>(value);
  const state = useBodyRegionState({ value: draft, onChange: setDraft, mode });
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
        setDraft(regionIds.slice(0, 1));
      } else {
        const newValue = [...new Set([...draft, ...regionIds])];
        setDraft(newValue);
      }
    },
    [draft, mode],
  );

  const handleDone = useCallback(() => {
    onChange(draft);
    onOpenChange(false);
  }, [draft, onChange, onOpenChange]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleCancel}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-5xl max-h-[85vh] mx-4 rounded-xl border border-white/15 bg-background shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/15 px-6 py-4 shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">Select Body Regions</h2>

            {/* Front/Back toggle */}
            <div className="flex rounded-lg border border-white/15 overflow-hidden">
              <button
                type="button"
                onClick={() => state.setSide("front")}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors",
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
                  "px-3 py-1.5 text-sm font-medium transition-colors border-l border-white/15",
                  state.side === "back"
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Back
              </button>
            </div>

            {draft.length > 0 && (
              <button
                type="button"
                onClick={state.clearAll}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw size={14} />
                Clear
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleCancel}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Large SVG area — left ~65% */}
          <div className="flex-[2] relative border-r border-white/10 bg-card/20 overflow-hidden flex items-center justify-center p-4">
            <div className="h-full max-h-[calc(85vh-180px)] aspect-[260/718] relative rounded-lg border border-white/10 bg-card/30 overflow-hidden">
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
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-background/90 border border-white/15 px-3 py-1 text-sm font-medium whitespace-nowrap pointer-events-none">
                  {getRegionLabel(state.hoveredRegion)}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar — right ~35% */}
          <div className="flex-[1] flex flex-col overflow-y-auto p-4 space-y-4">
            {/* Search input */}
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search regions..."
                className="w-full rounded-lg border border-white/15 bg-muted/30 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div data-testid="region-search-results" className="max-h-48 overflow-y-auto rounded-lg border border-white/15 bg-card/60 backdrop-blur-sm">
                {searchResults.slice(0, 15).map((region) => (
                  <button
                    key={region.id}
                    type="button"
                    onClick={() => handleSearchSelect(region.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-colors",
                      draft.includes(region.id) && "text-amber-400",
                    )}
                  >
                    {region.label}
                    {region.isSubRegion && (
                      <span className="ml-1 text-xs text-muted-foreground/50">
                        (detail)
                      </span>
                    )}
                    {draft.includes(region.id) && (
                      <span className="ml-1 text-xs text-amber-500">
                        (selected)
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Presets */}
            {mode === "multi" && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                  Presets
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {BODY_REGION_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handlePreset(preset.regionIds)}
                      className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-muted-foreground hover:border-amber-500/30 hover:text-amber-400 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Selected chips */}
            {draft.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                  Selected ({draft.length})
                </p>
                <BodyRegionChips
                  regions={draft}
                  onRemove={state.removeRegion}
                />
              </div>
            )}

            {/* Help */}
            <p className="text-xs text-muted-foreground/50">
              Click regions on the body map or search above.
              {mode === "multi" && " Select multiple regions for large items."}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/15 px-6 py-3 shrink-0">
          <div className="text-sm text-muted-foreground">
            {draft.length === 0
              ? "No regions selected"
              : `${draft.length} region${draft.length === 1 ? "" : "s"} selected`}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDone}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
