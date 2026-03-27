"use client";

import { useRef, useState, useCallback } from "react";
import type { BodySide } from "./use-body-region-state";
import { hasSubRegions } from "@/lib/constants/body-regions";
import { Front } from "./svg/front";
import { Back } from "./svg/back";
import { RegionPopover } from "./region-popover";

function getBodyImageUrl(side: string): string {
  const minioUrl =
    typeof window !== "undefined"
      ? (window as unknown as Record<string, string>).__MINIO_URL__
      : process.env.NEXT_PUBLIC_MINIO_URL;
  return `${minioUrl}/body/${side}.png`;
}

type BodyOverviewProps = {
  side: BodySide;
  selected: string[];
  hovered: string | null;
  onRegionClick: (id: string) => void;
  onRegionHover: (id: string | null) => void;
  onSubRegionSelect?: (id: string) => void;
};

export function BodyOverview({
  side,
  selected,
  hovered,
  onRegionClick,
  onRegionHover,
  onSubRegionSelect,
}: BodyOverviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<{
    regionId: string;
    position: { x: number; y: number };
  } | null>(null);

  const handleRegionClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (hasSubRegions(id)) {
        // Region has sub-regions: show/toggle the popover, don't toggle selection
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          setPopover((prev) =>
            prev?.regionId === id ? null : { regionId: id, position: { x, y } },
          );
        }
      } else {
        // No sub-regions: toggle selection directly
        onRegionClick(id);
        setPopover(null);
      }
    },
    [onRegionClick],
  );

  const handleSubRegionSelect = useCallback(
    (subId: string) => {
      if (onSubRegionSelect) {
        onSubRegionSelect(subId);
      }
    },
    [onSubRegionSelect],
  );

  const handleClosePopover = useCallback(() => {
    setPopover(null);
  }, []);

  const sharedProps = {
    selected,
    hovered,
    onRegionClick: handleRegionClick,
    onRegionHover,
  };

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <svg
        viewBox="0 0 260 718"
        className="h-full w-full"
        aria-label={`Body ${side} view`}
      >
        {/* PNG body silhouette background */}
        <image
          href={getBodyImageUrl(side)}
          x={0}
          y={0}
          width={260}
          height={718}
          className="pointer-events-none"
        />
        {/* Interactive region overlays */}
        {side === "front" && <Front {...sharedProps} />}
        {side === "back" && <Back {...sharedProps} />}
      </svg>

      {/* Sub-region popover */}
      {popover && (
        <RegionPopover
          regionId={popover.regionId}
          selected={selected}
          side={side}
          onSelect={handleSubRegionSelect}
          onSelectParent={onRegionClick}
          onClose={handleClosePopover}
          position={popover.position}
          containerRef={containerRef}
        />
      )}
    </div>
  );
}
