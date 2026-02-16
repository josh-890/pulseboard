"use client";

import { useSyncExternalStore } from "react";
import { usePalette } from "@/components/layout/palette-provider";
import { palettes } from "@/lib/palettes";
import { cn } from "@/lib/utils";

function subscribe() {
  return () => {};
}

function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export function PaletteSelector() {
  const { paletteName, setPalette } = usePalette();
  const mounted = useMounted();

  if (!mounted) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {palettes.map((p) => (
          <div
            key={p.name}
            className="h-20 animate-pulse rounded-xl bg-muted"
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      role="radiogroup"
      aria-label="Color palette"
    >
      {palettes.map((palette) => {
        const isActive = paletteName === palette.name;
        return (
          <button
            key={palette.name}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setPalette(palette.name)}
            className={cn(
              "group flex flex-col items-center gap-2 rounded-xl border p-3 transition-all duration-200",
              "hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isActive
                ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                : "border-border bg-card/50",
            )}
          >
            <div className="flex gap-1.5">
              <span
                className="size-5 rounded-full border border-white/20 shadow-sm"
                style={{ backgroundColor: palette.light.primary }}
                aria-hidden="true"
              />
              <span
                className="size-5 rounded-full border border-white/20 shadow-sm"
                style={{ backgroundColor: palette.light.accent }}
                aria-hidden="true"
              />
            </div>
            <span
              className={cn(
                "text-xs font-medium",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              {palette.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
