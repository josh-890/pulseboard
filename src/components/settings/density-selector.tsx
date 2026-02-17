"use client";

import { LayoutList, LayoutGrid } from "lucide-react";
import {
  useDensity,
  type DensityMode,
} from "@/components/layout/density-provider";
import { cn } from "@/lib/utils";

const options: { value: DensityMode; label: string; icon: typeof LayoutList; description: string }[] = [
  {
    value: "comfortable",
    label: "Comfortable",
    icon: LayoutList,
    description: "More spacing, two metadata lines",
  },
  {
    value: "compact",
    label: "Compact",
    icon: LayoutGrid,
    description: "Tighter spacing, single metadata line",
  },
];

export function DensitySelector() {
  const { density, setDensity } = useDensity();

  return (
    <div className="flex gap-3">
      {options.map((opt) => {
        const Icon = opt.icon;
        const selected = density === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setDensity(opt.value)}
            className={cn(
              "flex flex-1 items-center gap-3 rounded-xl border p-3 text-left transition-all duration-150",
              selected
                ? "border-primary bg-primary/10 ring-1 ring-primary"
                : "border-border hover:border-primary/50",
            )}
          >
            <Icon
              size={20}
              className={cn(
                selected ? "text-primary" : "text-muted-foreground",
              )}
            />
            <div>
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-muted-foreground">
                {opt.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
