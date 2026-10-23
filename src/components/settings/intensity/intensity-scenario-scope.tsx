"use client";

import { Layers } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type IntensityScenarioScopeProps = {
  /** What it is for, e.g. "the group Partner" or "First time" */
  of: string;
  /** Scenarios it does not count in */
  off: string[];
  scenarios: { id: string; name: string }[];
  onChange: (off: string[]) => void;
  className?: string;
};

// Where an extra counts (2026-10-23): a small icon with a menu of the
// scenarios, ticked = counts there. All ticked is the default; a new scenario
// is ticked too. The icon is coloured while some are off.
export function IntensityScenarioScope({ of, off, scenarios, onChange, className }: IntensityScenarioScopeProps) {
  const toggle = (id: string) => onChange(off.includes(id) ? off.filter((x) => x !== id) : [...off, id]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Scenarios ${of} counts in`}
          title={off.length ? "Counts in some scenarios only" : "Counts in every scenario"}
          className={cn(
            "hover:bg-muted/50 hover:text-foreground shrink-0 rounded p-1 transition-colors",
            off.length ? "text-primary" : "text-muted-foreground opacity-60 group-hover/extra:opacity-100 focus-visible:opacity-100",
            className,
          )}
        >
          <Layers size={12} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs">Counts in</DropdownMenuLabel>
        {scenarios.map((s) => (
          <DropdownMenuCheckboxItem
            key={s.id}
            checked={!off.includes(s.id)}
            // Keep the menu open: several are often changed at once
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => toggle(s.id)}
          >
            {s.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "not in Solo", "not in Solo, G-G" — or nothing while it counts everywhere */
export function scopeHint(off: string[], scenarios: { id: string; name: string }[]): string | null {
  const names = scenarios.filter((s) => off.includes(s.id)).map((s) => s.name);
  return names.length ? `not in ${names.join(", ")}` : null;
}
