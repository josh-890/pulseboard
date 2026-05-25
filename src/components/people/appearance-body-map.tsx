"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PersonCurrentState } from "@/lib/types";
import { BodyOverview } from "@/components/shared/body-region-picker/body-overview";
import { getRegionLabel } from "@/lib/constants/body-regions";
import { EntityHoverTooltip, type EntityTooltipItem, type EntityTooltipThumbnail } from "@/components/people/entity-hover-tooltip";

// Phase G Slice 13: Level-2 interactivity.
//  - hoveredRegion is **externally controlled** so list-row hover can drive
//    the map and vice versa.
//  - onSelectRegion fires when the user clicks a region that has at least
//    one entity; appearance-tab uses this to set the filter chip on the
//    BodyFeaturesCard.
//
// Phase G Slice 14: hover tooltip with bounded image (300ms delay before
// reveal to prevent drive-by flicker). Click an entity row in the tooltip
// → onEntityClick fires; parent scrolls to + highlights the matching list
// row.

const TOOLTIP_SHOW_DELAY_MS = 300;

type AppearanceBodyMapProps = {
  currentState: PersonCurrentState;
  hoveredRegion: string | null;
  onHoverRegion: (regionId: string | null) => void;
  selectedRegion: string | null;
  onSelectRegion: (regionId: string | null) => void;
  /** Thumbnails per entity (keyed by mark/mod id). Same shape used by row photos. */
  entityMedia?: Record<string, Array<EntityTooltipThumbnail> | undefined>;
  /** Fires when the user clicks an entity inside the tooltip. */
  onEntityClick?: (entityId: string) => void;
};

type RegionEntity = {
  id: string;
  type: string;
  description: string | null;
  category: "mark" | "modification";
  status: "present" | "modified" | "removed" | "overgrown";
};

export function AppearanceBodyMap({
  currentState,
  hoveredRegion,
  onHoverRegion,
  selectedRegion,
  onSelectRegion,
  entityMedia,
  onEntityClick,
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
          id: mark.id,
          type: mark.type,
          description: c.motif ?? c.description ?? null,
          category: "mark",
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
          id: mod.id,
          type: mod.type,
          description: c.description ?? null,
          category: "modification",
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

  // Phase G Slice 14: delay tooltip reveal by 300ms to prevent flicker on
  // hover-out. Cancel the pending timer if the hover ends before it fires.
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (tooltipEntities) {
      showTimerRef.current = setTimeout(() => setTooltipVisible(true), TOOLTIP_SHOW_DELAY_MS);
    } else {
      setTooltipVisible(false);
    }
    return () => {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };
  }, [tooltipEntities]);

  // Resolve thumbnails per entity from the entityMedia map (first photo).
  const tooltipItems: EntityTooltipItem[] = useMemo(() => {
    if (!tooltipEntities || !hoveredRegion) return [];
    const regionLabel = getRegionLabel(hoveredRegion);
    return tooltipEntities.map((e) => {
      const photos = entityMedia?.[e.id];
      const thumbnail = photos && photos.length > 0 ? photos[0] : undefined;
      return {
        id: e.id,
        type: e.type,
        category: e.category,
        regionLabel,
        description: e.description,
        status: e.status,
        thumbnail,
      };
    });
  }, [tooltipEntities, hoveredRegion, entityMedia]);

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

        {tooltipVisible && tooltipItems.length > 0 && (
          <div className="absolute inset-x-0 top-0 z-20 flex justify-center">
            <EntityHoverTooltip
              items={tooltipItems}
              onItemClick={onEntityClick}
            />
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
