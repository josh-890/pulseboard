"use client";

import { useRef } from "react";
import { ToneSwatch } from "@/components/shared/tone-swatch";
import type { GalleryTone, ToneTally } from "@/lib/hooks/use-tone-filter";
import { cn } from "@/lib/utils";

export type ToneFilterPillProps = {
  value: GalleryTone;
  counts: ToneTally;
  onChange: (tone: GalleryTone) => void;
};

const OPTIONS: { value: GalleryTone; label: string; swatch?: "color" | "mono" }[] = [
  { value: "all", label: "All" },
  { value: "COLOR", label: "Color", swatch: "color" },
  { value: "MONO", label: "B&W", swatch: "mono" },
];

/**
 * All · Color · B&W over a gallery (ADR-0041) — a fixed pill: the segments keep
 * their width whatever is chosen, the counts follow the other filters.
 */
export function ToneFilterPill({ value, counts, onChange }: ToneFilterPillProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + OPTIONS.length) % OPTIONS.length;
    onChange(OPTIONS[next]!.value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Color or black & white"
      data-testid="tone-filter"
      className="inline-flex items-center gap-0.5 rounded-full border border-white/20 bg-card/60 p-0.5 shadow-sm backdrop-blur-sm"
    >
      {OPTIONS.map((o, i) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            data-value={o.value}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-card/80 hover:text-foreground",
            )}
          >
            {o.swatch && <ToneSwatch tone={o.swatch} size="xs" />}
            <span>{o.label}</span>
            <span className={cn("min-w-[2ch] text-right tabular-nums", on ? "opacity-80" : "opacity-60")}>
              {counts[o.value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
