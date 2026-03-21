"use client";

import { useCallback, useMemo, useState } from "react";
import type { PersonCurrentState } from "@/lib/types";
import { BodyOverview } from "@/components/shared/body-region-picker/body-overview";
import { getRegionLabel } from "@/lib/constants/body-regions";

type AppearanceBodyMapProps = {
  currentState: PersonCurrentState;
  onRegionClick?: (regionId: string) => void;
};

type RegionEntity = {
  label: string;
  type: "mark" | "modification" | "procedure";
};

export function AppearanceBodyMap({ currentState, onRegionClick }: AppearanceBodyMapProps) {
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);

  // Collect all active entity regions into a single set for highlighting
  const { allRegions, regionEntities } = useMemo(() => {
    const entities = new Map<string, RegionEntity[]>();
    const regions = new Set<string>();

    for (const mark of currentState.activeBodyMarks) {
      const markRegions = mark.bodyRegions.length > 0 ? mark.bodyRegions : [mark.bodyRegion];
      for (const r of markRegions) {
        regions.add(r);
        const list = entities.get(r) ?? [];
        list.push({ label: `${mark.type}${mark.motif ? `: ${mark.motif}` : ""}`, type: "mark" });
        entities.set(r, list);
      }
    }

    for (const mod of currentState.activeBodyModifications) {
      const modRegions = mod.bodyRegions.length > 0 ? mod.bodyRegions : [mod.bodyRegion];
      for (const r of modRegions) {
        regions.add(r);
        const list = entities.get(r) ?? [];
        list.push({ label: `${mod.type}${mod.description ? `: ${mod.description}` : ""}`, type: "modification" });
        entities.set(r, list);
      }
    }

    for (const proc of currentState.activeCosmeticProcedures) {
      const procRegions = proc.bodyRegions.length > 0 ? proc.bodyRegions : [proc.bodyRegion];
      for (const r of procRegions) {
        regions.add(r);
        const list = entities.get(r) ?? [];
        list.push({ label: proc.type, type: "procedure" });
        entities.set(r, list);
      }
    }

    return { allRegions: Array.from(regions), regionEntities: entities };
  }, [currentState]);

  const handleRegionClick = useCallback(
    (id: string) => {
      if (onRegionClick && regionEntities.has(id)) {
        onRegionClick(id);
      }
    },
    [onRegionClick, regionEntities],
  );

  const handleRegionHover = useCallback((id: string | null) => {
    setHoveredRegion(id);
  }, []);

  // When hovering a parent region (e.g. "face"), also collect entities from
  // sub-regions (e.g. "face.nose", "face.lips") for the tooltip
  const tooltipEntities = useMemo(() => {
    if (!hoveredRegion) return null;
    const direct = regionEntities.get(hoveredRegion) ?? [];
    const fromChildren: RegionEntity[] = [];
    const prefix = hoveredRegion + ".";
    for (const [key, entities] of regionEntities) {
      if (key.startsWith(prefix)) {
        fromChildren.push(...entities);
      }
    }
    const combined = [...direct, ...fromChildren];
    return combined.length > 0 ? combined : null;
  }, [hoveredRegion, regionEntities]);

  const totalEntities = currentState.activeBodyMarks.length + currentState.activeBodyModifications.length + currentState.activeCosmeticProcedures.length;

  if (totalEntities === 0) return null;

  const sharedProps = {
    selected: allRegions,
    hovered: null,
    onRegionClick: handleRegionClick,
    onRegionHover: handleRegionHover,
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Both body views side by side, with tooltip overlaid */}
      <div className="relative flex w-full gap-1">
        <div className="flex-1">
          <BodyOverview side="front" {...sharedProps} />
        </div>
        <div className="flex-1">
          <BodyOverview side="back" {...sharedProps} />
        </div>

        {/* Tooltip — absolutely positioned so it doesn't shift layout */}
        {tooltipEntities && hoveredRegion && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center">
            <div className="rounded-lg border border-white/15 bg-card/95 px-3 py-1.5 shadow-lg backdrop-blur-md">
              <p className="mb-0.5 text-[11px] font-semibold text-foreground">
                {getRegionLabel(hoveredRegion)}
              </p>
              {tooltipEntities.map((entity, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[11px]">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      entity.type === "mark"
                        ? "bg-amber-500"
                        : entity.type === "modification"
                          ? "bg-teal-500"
                          : "bg-rose-500"
                    }`}
                  />
                  <span className="text-muted-foreground">{entity.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-3 text-[10px] text-muted-foreground">
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
        {currentState.activeCosmeticProcedures.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            Procedures
          </span>
        )}
      </div>
    </div>
  );
}
