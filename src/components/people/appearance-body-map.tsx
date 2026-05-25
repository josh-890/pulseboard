"use client";

import { useCallback, useMemo } from "react";
import type { PersonCurrentState } from "@/lib/types";
import { BodyOverview } from "@/components/shared/body-region-picker/body-overview";
import { getRegionLabel } from "@/lib/constants/body-regions";

// Phase G Slice 13: Level-2 interactivity.
//  - hoveredRegion is **externally controlled** so list-row hover can drive
//    the map and vice versa.
//  - onSelectRegion fires when the user clicks a region that has at least
//    one entity; appearance-tab uses this to set the filter chip on the
//    BodyFeaturesCard.
//  - Removed marks/modifications render as outlined dots in the tooltip
//    (historical presence is interesting; the list view alone loses it).

type AppearanceBodyMapProps = {
  currentState: PersonCurrentState;
  hoveredRegion: string | null;
  onHoverRegion: (regionId: string | null) => void;
  selectedRegion: string | null;
  onSelectRegion: (regionId: string | null) => void;
};

type RegionEntity = {
  label: string;
  type: "mark" | "modification";
  status: "present" | "modified" | "removed" | "overgrown";
};

export function AppearanceBodyMap({
  currentState,
  hoveredRegion,
  onHoverRegion,
  selectedRegion,
  onSelectRegion,
}: AppearanceBodyMapProps) {
  // Collect all entity regions for highlighting + tooltip content.
  const { allRegions, regionEntities } = useMemo(() => {
    const entities = new Map<string, RegionEntity[]>();
    const regions = new Set<string>();

    for (const mark of currentState.activeBodyMarks) {
      const c = mark.computed;
      const markRegions = c.bodyRegions.length > 0 ? c.bodyRegions : [mark.bodyRegion];
      for (const r of markRegions) {
        regions.add(r);
        const list = entities.get(r) ?? [];
        list.push({
          label: `${mark.type}${c.motif ? `: ${c.motif}` : ""}`,
          type: "mark",
          status: mark.status,
        });
        entities.set(r, list);
      }
    }

    for (const mod of currentState.activeBodyModifications) {
      const c = mod.computed;
      const modRegions = c.bodyRegions.length > 0 ? c.bodyRegions : [mod.bodyRegion];
      for (const r of modRegions) {
        regions.add(r);
        const list = entities.get(r) ?? [];
        list.push({
          label: `${mod.type}${c.description ? `: ${c.description}` : ""}`,
          type: "modification",
          status: mod.status,
        });
        entities.set(r, list);
      }
    }

    return { allRegions: Array.from(regions), regionEntities: entities };
  }, [currentState]);

  const handleRegionClick = useCallback(
    (id: string) => {
      if (!regionEntities.has(id)) return;
      // Toggle: clicking the currently-selected region clears the filter.
      onSelectRegion(selectedRegion === id ? null : id);
    },
    [onSelectRegion, regionEntities, selectedRegion],
  );

  // Tooltip: include direct + child-region entities (e.g. hovering "face"
  // surfaces "face.nose" entries too).
  const tooltipEntities = useMemo(() => {
    if (!hoveredRegion) return null;
    const direct = regionEntities.get(hoveredRegion) ?? [];
    const fromChildren: RegionEntity[] = [];
    const prefix = hoveredRegion + ".";
    for (const [key, list] of regionEntities) {
      if (key.startsWith(prefix)) {
        fromChildren.push(...list);
      }
    }
    const combined = [...direct, ...fromChildren];
    return combined.length > 0 ? combined : null;
  }, [hoveredRegion, regionEntities]);

  const totalEntities = currentState.activeBodyMarks.length + currentState.activeBodyModifications.length;

  if (totalEntities === 0) return null;

  const sharedProps = {
    selected: allRegions,
    hovered: hoveredRegion,
    onRegionClick: handleRegionClick,
    onRegionHover: onHoverRegion,
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex w-full gap-1">
        <div className="flex-1">
          <BodyOverview side="front" {...sharedProps} />
        </div>
        <div className="flex-1">
          <BodyOverview side="back" {...sharedProps} />
        </div>

        {tooltipEntities && hoveredRegion && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center">
            <div className="rounded-lg border border-white/15 bg-card/95 px-3 py-1.5 shadow-lg backdrop-blur-md">
              <p className="mb-0.5 text-[11px] font-semibold text-foreground">
                {getRegionLabel(hoveredRegion)}
              </p>
              {tooltipEntities.map((entity, i) => {
                const isMark = entity.type === "mark";
                const isRemoved = entity.status === "removed";
                // Dot style: filled = present; outlined = removed. Tailwind
                // needs literal class names, so the four combinations are
                // spelled out rather than interpolated.
                const dotClass = isMark
                  ? isRemoved
                    ? "border border-amber-500 bg-transparent"
                    : "border border-amber-500 bg-amber-500"
                  : isRemoved
                    ? "border border-teal-500 bg-transparent"
                    : "border border-teal-500 bg-teal-500";
                return (
                  <div key={i} className="flex items-center gap-1.5 text-[11px]">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`}
                      aria-label={isRemoved ? `${entity.type} (removed)` : entity.type}
                    />
                    <span
                      className={
                        isRemoved
                          ? "text-muted-foreground/60 line-through"
                          : "text-muted-foreground"
                      }
                    >
                      {entity.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Legend + filter hint */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] text-muted-foreground">
        {currentState.activeBodyMarks.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Marks
          </span>
        )}
        {currentState.activeBodyModifications.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-teal-500" />
            Mods
          </span>
        )}
        <span className="text-muted-foreground/60">Click a region to filter</span>
      </div>
    </div>
  );
}
