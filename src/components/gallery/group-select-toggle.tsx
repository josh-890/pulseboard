"use client";

import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type GroupSelectToggleProps = {
  state: "all" | "some" | "none";
  /** What the group is called, for the accessible label. */
  label: string;
  onToggle: () => void;
};

/**
 * Tri-state checkbox on a gallery group header (session, clip) — Google Photos'
 * "select this day". Selects the whole group, or clears it when fully selected.
 */
export function GroupSelectToggle({ state, label, onToggle }: GroupSelectToggleProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "all" ? true : state === "some" ? "mixed" : false}
      aria-label={state === "all" ? `Deselect ${label}` : `Select all in ${label}`}
      title={state === "all" ? "Deselect group" : "Select group"}
      onClick={onToggle}
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        state === "none"
          ? "border-muted-foreground/50 text-transparent hover:border-foreground/70"
          : "border-primary bg-primary text-primary-foreground",
      )}
    >
      {state === "some" ? <Minus size={10} /> : <Check size={10} />}
    </button>
  );
}
