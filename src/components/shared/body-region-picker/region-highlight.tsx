"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { getRegionLabel, getSubRegionView } from "@/lib/constants/body-regions";

type RegionPathProps = {
  id: string;
  d: string;
  selected: string[];
  hovered: string | null;
  side: "front" | "back";
  onClick: (id: string, e: React.MouseEvent) => void;
  onHover: (id: string | null) => void;
};

export function RegionPath({
  id,
  d,
  selected,
  hovered,
  side,
  onClick,
  onHover,
}: RegionPathProps) {
  // Highlight if the region itself is selected OR any of its view-matching sub-regions are selected
  const isSelected =
    selected.includes(id) ||
    selected.some((s) => {
      if (!s.startsWith(id + ".")) return false;
      const v = getSubRegionView(s);
      return v === "both" || v === side;
    });
  const isHovered = hovered === id;

  const handleClick = useCallback(
    (e: React.MouseEvent) => onClick(id, e),
    [id, onClick],
  );
  const handleMouseEnter = useCallback(() => onHover(id), [id, onHover]);
  const handleMouseLeave = useCallback(() => onHover(null), [onHover]);

  return (
    <path
      d={d}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="button"
      aria-label={getRegionLabel(id)}
      aria-pressed={isSelected}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(id, e as unknown as React.MouseEvent);
        }
      }}
      className={cn(
        "cursor-pointer outline-none transition-all duration-150",
        isSelected
          ? "body-region-selected"
          : isHovered
            ? "body-region-hovered"
            : "body-region-base",
      )}
      fill={
        isSelected
          ? "rgba(245, 158, 11, 0.4)"
          : isHovered
            ? "rgba(245, 158, 11, 0.18)"
            : "transparent"
      }
      stroke={
        isSelected
          ? "rgba(245, 158, 11, 0.8)"
          : isHovered
            ? "rgba(245, 158, 11, 0.4)"
            : "var(--body-region-base-stroke)"
      }
      strokeWidth={isSelected ? 1.5 : isHovered ? 1 : 0.3}
      strokeOpacity={isSelected || isHovered ? 1 : 0.3}
      style={{
        filter: isSelected
          ? "drop-shadow(0 0 4px rgba(245, 158, 11, 0.3))"
          : isHovered
            ? "drop-shadow(0 0 2px rgba(245, 158, 11, 0.15))"
            : "none",
      }}
    />
  );
}
