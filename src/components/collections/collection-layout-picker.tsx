"use client";

import { LayoutGrid, Columns2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CollectionLayout } from "@/lib/services/collection-service";

const OPTIONS: { value: CollectionLayout; label: string; icon: typeof LayoutGrid }[] = [
  { value: "GRID", label: "Grid", icon: LayoutGrid },
  { value: "SIDE_BY_SIDE", label: "Before / after", icon: Columns2 },
];

export function CollectionLayoutPicker({
  value,
  onChange,
}: {
  value: CollectionLayout;
  onChange: (value: CollectionLayout) => void;
}) {
  return (
    <div className="mt-1 flex gap-1 rounded-md border border-white/15 bg-background/60 p-0.5">
      {OPTIONS.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors",
            value === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon size={13} /> {label}
        </button>
      ))}
    </div>
  );
}
