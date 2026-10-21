"use client";

import { Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIntensityPanel } from "./intensity-panel-provider";

export type IntensityPanelToggleProps = {
  className?: string;
};

// Opens or closes the intensity panel beside the photos.
export function IntensityPanelToggle({ className }: IntensityPanelToggleProps) {
  const { open, setOpen } = useIntensityPanel();
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-pressed={open}
      title={open ? "Close the intensity panel" : "Record intensity beside the photos"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        open ? "border-primary bg-primary text-primary-foreground" : "border-white/15 text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <Gauge size={13} aria-hidden="true" /> Intensity
    </button>
  );
}
