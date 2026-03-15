"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { BodyRegionChips } from "./body-region-chips";
import { BodyRegionDialog } from "./body-region-dialog";

type BodyRegionCompactProps = {
  value: string[];
  onChange: (regions: string[]) => void;
  mode?: "single" | "multi";
  className?: string;
};

export function BodyRegionCompact({
  value,
  onChange,
  mode = "multi",
  className,
}: BodyRegionCompactProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className={cn("space-y-2", className)}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className={cn(
          "w-full flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors text-left",
          value.length > 0
            ? "border-amber-500/30 bg-amber-500/5 text-foreground hover:border-amber-500/50"
            : "border-white/15 bg-muted/30 text-muted-foreground hover:border-white/30",
        )}
      >
        <MapPin size={16} className={value.length > 0 ? "text-amber-400" : "text-muted-foreground"} />
        <span className="flex-1">
          {value.length === 0
            ? "Select Regions..."
            : `${value.length} region${value.length === 1 ? "" : "s"} selected`}
        </span>
        <span className="text-xs text-muted-foreground">
          {value.length > 0 ? "Edit" : "Open"}
        </span>
      </button>

      {/* Selected chips (read-only display, removable) */}
      {value.length > 0 && (
        <BodyRegionChips
          regions={value}
          onRemove={(id) => onChange(value.filter((r) => r !== id))}
          onClear={mode === "multi" ? () => onChange([]) : undefined}
          compact
        />
      )}

      {/* Dialog */}
      <BodyRegionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        value={value}
        onChange={onChange}
        mode={mode}
      />
    </div>
  );
}
