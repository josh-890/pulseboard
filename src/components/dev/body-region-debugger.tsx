"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Copy, Check, Eye, EyeOff, Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BODY_REGIONS,
  getRegionLabel,
  getSubRegions,
  type BodyRegion,
} from "@/lib/constants/body-regions";
import { BodyOverview } from "@/components/shared/body-region-picker/body-overview";
import { useBodyRegionState } from "@/components/shared/body-region-picker/use-body-region-state";

// SVG viewBox dimensions (must match body-overview.tsx)
const SVG_W = 260;
const SVG_H = 718;

// Group regions by body area for sidebar
const AREA_GROUPS: { label: string; filter: (r: BodyRegion) => boolean }[] = [
  { label: "Head & Neck", filter: (r) => ["face", "neck_front", "neck_back", "neck_side_r", "neck_side_l"].includes(r.id) },
  { label: "Shoulders & Clavicle", filter: (r) => r.id.startsWith("shoulder") || r.id.startsWith("clavicle") },
  { label: "Chest", filter: (r) => ["upper_chest_r", "upper_chest_l", "breast_r", "breast_l", "nipple_r", "nipple_l", "sternum"].includes(r.id) },
  { label: "Abdomen & Flanks", filter: (r) => r.id.startsWith("abdomen") || r.id === "navel" || r.id.startsWith("ribcage") || r.id.startsWith("flank") },
  { label: "Groin & Pubic", filter: (r) => r.id.startsWith("groin") || r.id === "pubic" },
  { label: "Back", filter: (r) => r.id.startsWith("back_") || r.id.startsWith("shoulder_blade") || r.id === "sacral" },
  { label: "Buttocks", filter: (r) => r.id.startsWith("buttock") || r.id === "gluteal_cleft" },
  { label: "Arms", filter: (r) => r.id.startsWith("upper_arm") || r.id.startsWith("elbow") || r.id.startsWith("forearm") || r.id.startsWith("wrist") || r.id.startsWith("hand") },
  { label: "Hips", filter: (r) => r.id.startsWith("hip") },
  { label: "Legs & Feet", filter: (r) => r.id.startsWith("thigh") || r.id.startsWith("knee") || r.id.startsWith("lower_leg") || r.id.startsWith("ankle") || r.id.startsWith("foot") },
];

/** Convert mouse event to SVG viewBox coordinates */
function mouseToSvg(
  e: React.MouseEvent,
  svgEl: SVGSVGElement,
): { x: number; y: number } | null {
  const rect = svgEl.getBoundingClientRect();
  const scaleX = SVG_W / rect.width;
  const scaleY = SVG_H / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  return { x: Math.round(x), y: Math.round(y) };
}

export function BodyRegionDebugger() {
  const [selected, setSelected] = useState<string[]>([]);
  const state = useBodyRegionState({ value: selected, onChange: setSelected, mode: "multi" });
  const [inspectedRegion, setInspectedRegion] = useState<string | null>(null);
  const [pathData, setPathData] = useState<string | null>(null);
  const [editedPath, setEditedPath] = useState<string | null>(null);
  const [svgCoords, setSvgCoords] = useState<{ x: number; y: number } | null>(null);
  const [showAllBounds, setShowAllBounds] = useState(false);
  const [showCoords, setShowCoords] = useState(true);
  const [copied, setCopied] = useState(false);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  // Find the SVG element inside the container
  const getSvgEl = useCallback((): SVGSVGElement | null => {
    return svgContainerRef.current?.querySelector("svg") ?? null;
  }, []);

  // Find a path element by region ID
  const getPathEl = useCallback(
    (id: string): Element | null => {
      if (!svgContainerRef.current) return null;
      return svgContainerRef.current.querySelector(
        `[aria-label="${getRegionLabel(id)}"]`,
      );
    },
    [],
  );

  // Extract path data for a region
  const extractPathData = useCallback(
    (id: string) => {
      requestAnimationFrame(() => {
        const pathEl = getPathEl(id);
        if (pathEl) {
          const d = pathEl.getAttribute("d");
          setPathData(d);
          setEditedPath(d);
        } else {
          setPathData(null);
          setEditedPath(null);
        }
      });
    },
    [getPathEl],
  );

  const handleRegionClick = useCallback(
    (id: string) => {
      state.toggleRegion(id);
      setInspectedRegion(id);
      extractPathData(id);
    },
    [state, extractPathData],
  );

  const handleSidebarRegionClick = useCallback(
    (id: string) => {
      const region = BODY_REGIONS.find((r) => r.id === id);
      if (region) {
        if (region.view === "back") {
          state.setSide("back");
        } else if (region.view === "front") {
          state.setSide("front");
        }
      }

      setInspectedRegion(id);
      state.setHoveredRegion(id);
      // Delay extraction to allow side switch to render
      setTimeout(() => extractPathData(id), 50);
    },
    [state, extractPathData],
  );

  // Live-update SVG path when editing
  const handlePathEdit = useCallback(
    (newPath: string) => {
      setEditedPath(newPath);
      if (!inspectedRegion) return;
      const pathEl = getPathEl(inspectedRegion);
      if (pathEl) {
        pathEl.setAttribute("d", newPath);
      }
    },
    [inspectedRegion, getPathEl],
  );

  // Reset path to original
  const handlePathReset = useCallback(() => {
    if (pathData === null || !inspectedRegion) return;
    setEditedPath(pathData);
    const pathEl = getPathEl(inspectedRegion);
    if (pathEl) {
      pathEl.setAttribute("d", pathData);
    }
  }, [pathData, inspectedRegion, getPathEl]);

  // Copy path to clipboard
  const handleCopy = useCallback(async () => {
    if (!editedPath) return;
    await navigator.clipboard.writeText(editedPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [editedPath]);

  // Copy JSX line for the region
  const handleCopyJsx = useCallback(async () => {
    if (!editedPath || !inspectedRegion) return;
    const jsx = `<RegionPath id="${inspectedRegion}" d="${editedPath}" {...p} />`;
    await navigator.clipboard.writeText(jsx);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [editedPath, inspectedRegion]);

  // Track mouse coordinates over SVG
  const handleSvgMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!showCoords) return;
      const svgEl = getSvgEl();
      if (!svgEl) return;
      setSvgCoords(mouseToSvg(e, svgEl));
    },
    [showCoords, getSvgEl],
  );

  const handleSvgMouseLeave = useCallback(() => {
    setSvgCoords(null);
  }, []);

  // Toggle "show all boundaries" by adding/removing stroke attributes
  useEffect(() => {
    if (!svgContainerRef.current) return;
    const paths = svgContainerRef.current.querySelectorAll("path[aria-label]");
    for (const path of paths) {
      if (showAllBounds) {
        path.setAttribute("stroke", "rgba(100, 180, 255, 0.5)");
        path.setAttribute("stroke-width", "0.8");
        path.setAttribute("stroke-opacity", "1");
      } else {
        path.removeAttribute("stroke");
        path.removeAttribute("stroke-width");
        path.removeAttribute("stroke-opacity");
      }
    }
  }, [showAllBounds]);

  const inspectedRegionData = inspectedRegion
    ? BODY_REGIONS.find((r) => r.id === inspectedRegion)
    : null;
  const subRegions = inspectedRegion ? getSubRegions(inspectedRegion) : [];
  const isPathModified = editedPath !== null && pathData !== null && editedPath !== pathData;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Left: Large SVG */}
      <div
        ref={svgContainerRef}
        className="flex-[2] flex items-center justify-center bg-card/10 p-6 relative"
        onMouseMove={handleSvgMouseMove}
        onMouseLeave={handleSvgMouseLeave}
      >
        <div className="h-full max-h-[calc(100vh-48px)] aspect-[260/718] relative rounded-lg border border-white/10 bg-card/30 overflow-hidden">
          <BodyOverview
            side={state.side}
            selected={state.selected}
            hovered={state.hoveredRegion}
            onRegionClick={handleRegionClick}
            onRegionHover={state.setHoveredRegion}
            onSubRegionSelect={state.toggleSubRegion}
          />

          {/* Hover tooltip */}
          {state.hoveredRegion && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-background/95 border border-white/15 px-3 py-1.5 text-sm font-medium whitespace-nowrap pointer-events-none shadow-lg z-10">
              <span className="text-amber-400 font-mono text-xs mr-2">
                {state.hoveredRegion}
              </span>
              {getRegionLabel(state.hoveredRegion)}
            </div>
          )}
        </div>

        {/* Controls (top-left) */}
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <div className="flex rounded-lg border border-white/15 overflow-hidden bg-background/80 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => state.setSide("front")}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors",
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
                "px-4 py-2 text-sm font-medium transition-colors border-l border-white/15",
                state.side === "back"
                  ? "bg-amber-500/20 text-amber-400"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Back
            </button>
          </div>

          {/* Toggle all boundaries */}
          <button
            type="button"
            onClick={() => setShowAllBounds((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors bg-background/80 backdrop-blur-sm",
              showAllBounds
                ? "border-blue-500/40 text-blue-400"
                : "border-white/15 text-muted-foreground hover:text-foreground",
            )}
            title="Show all region boundaries"
          >
            {showAllBounds ? <Eye size={14} /> : <EyeOff size={14} />}
            Bounds
          </button>

          {/* Toggle coordinate display */}
          <button
            type="button"
            onClick={() => setShowCoords((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors bg-background/80 backdrop-blur-sm",
              showCoords
                ? "border-green-500/40 text-green-400"
                : "border-white/15 text-muted-foreground hover:text-foreground",
            )}
            title="Show SVG coordinates on hover"
          >
            <Crosshair size={14} />
            XY
          </button>
        </div>

        {/* SVG coordinates display (top-right of SVG area) */}
        {showCoords && svgCoords && (
          <div className="absolute top-4 right-4 rounded-md bg-background/90 border border-white/15 px-3 py-1.5 font-mono text-sm pointer-events-none shadow-lg">
            <span className="text-green-400">{svgCoords.x}</span>
            <span className="text-muted-foreground mx-1">,</span>
            <span className="text-green-400">{svgCoords.y}</span>
          </div>
        )}

        {/* ViewBox reference */}
        <div className="absolute bottom-4 left-4 text-[10px] text-muted-foreground/40 font-mono">
          viewBox 0 0 {SVG_W} {SVG_H}
        </div>
      </div>

      {/* Right: Sidebar */}
      <div className="flex-[1] border-l border-white/15 flex flex-col overflow-hidden min-w-[320px]">
        {/* Inspected region details + path editor */}
        {inspectedRegion && (
          <div className="shrink-0 border-b border-white/15 p-4 space-y-3 bg-card/20 overflow-y-auto max-h-[55vh]">
            <div>
              <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-1">
                Inspected Region
              </p>
              <p className="text-base font-semibold">
                {getRegionLabel(inspectedRegion)}
              </p>
              <p className="text-xs font-mono text-amber-400 mt-0.5">
                {inspectedRegion}
              </p>
            </div>

            {inspectedRegionData && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">View: </span>
                  <span className="font-medium">{inspectedRegionData.view}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Sub-regions: </span>
                  <span className="font-medium">{subRegions.length}</span>
                </div>
              </div>
            )}

            {subRegions.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Sub-regions:</p>
                <div className="flex flex-wrap gap-1">
                  {subRegions.map((sub) => (
                    <span
                      key={sub.id}
                      className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-mono text-muted-foreground"
                    >
                      {sub.id}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Path editor */}
            {editedPath !== null && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    SVG Path (d)
                    {isPathModified && (
                      <span className="ml-1.5 text-amber-400">(modified)</span>
                    )}
                  </p>
                  <div className="flex items-center gap-1">
                    {isPathModified && (
                      <button
                        type="button"
                        onClick={handlePathReset}
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 transition-colors"
                      >
                        Reset
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 transition-colors flex items-center gap-0.5"
                      title="Copy path data"
                    >
                      {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
                      d
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyJsx}
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 transition-colors flex items-center gap-0.5"
                      title="Copy full JSX line"
                    >
                      {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
                      JSX
                    </button>
                  </div>
                </div>
                <textarea
                  value={editedPath}
                  onChange={(e) => handlePathEdit(e.target.value)}
                  rows={4}
                  spellCheck={false}
                  className={cn(
                    "w-full text-[11px] font-mono rounded-md border p-2 bg-black/30 focus:outline-none focus:ring-1 resize-y",
                    isPathModified
                      ? "border-amber-500/40 text-amber-300 focus:ring-amber-500/50"
                      : "border-white/10 text-muted-foreground focus:ring-white/20",
                  )}
                />
                {isPathModified && (
                  <p className="text-[10px] text-amber-400/70 mt-1">
                    Live preview active. Copy the path and paste into front.tsx / back.tsx to persist.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* No region selected */}
        {!inspectedRegion && (
          <div className="shrink-0 border-b border-white/15 p-4 bg-card/20">
            <p className="text-sm text-muted-foreground/60">
              Click a region on the body map or in the list below to inspect and edit its SVG path.
            </p>
            <div className="mt-2 text-[10px] text-muted-foreground/40 space-y-0.5">
              <p><span className="text-green-400">XY</span> — hover over SVG to see coordinates</p>
              <p><span className="text-blue-400">Bounds</span> — show all region outlines</p>
              <p>Edit the path textarea for live preview</p>
            </div>
          </div>
        )}

        {/* Region list */}
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">
            All Regions ({BODY_REGIONS.length})
          </p>

          {AREA_GROUPS.map((group) => {
            const regions = BODY_REGIONS.filter(group.filter);
            if (regions.length === 0) return null;
            return (
              <div key={group.label} className="mb-3">
                <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-1 px-1">
                  {group.label}
                </p>
                <div className="space-y-px">
                  {regions.map((region) => (
                    <button
                      key={region.id}
                      type="button"
                      onClick={() => handleSidebarRegionClick(region.id)}
                      onMouseEnter={() => state.setHoveredRegion(region.id)}
                      onMouseLeave={() => state.setHoveredRegion(null)}
                      className={cn(
                        "w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center justify-between",
                        inspectedRegion === region.id
                          ? "bg-amber-500/15 text-amber-400"
                          : state.selected.includes(region.id)
                            ? "bg-amber-500/10 text-amber-300"
                            : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                      )}
                    >
                      <span>{region.label}</span>
                      <span className="font-mono text-[10px] opacity-60">
                        {region.id}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
