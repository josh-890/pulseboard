"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRegionChipLabel } from "@/lib/constants/body-regions";

type BodyRegionChipsProps = {
  regions: string[];
  onRemove?: (id: string) => void;
  onClear?: () => void;
  compact?: boolean;
  className?: string;
};

export function BodyRegionChips({
  regions,
  onRemove,
  onClear,
  compact,
  className,
}: BodyRegionChipsProps) {
  if (regions.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {regions.map((id) => (
        <span
          key={id}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
            compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs",
            "font-medium",
          )}
        >
          {getRegionChipLabel(id)}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(id)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-amber-500/20 transition-colors"
              aria-label={`Remove ${getRegionChipLabel(id)}`}
            >
              <X size={compact ? 10 : 12} />
            </button>
          )}
        </span>
      ))}
      {onClear && regions.length > 1 && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
