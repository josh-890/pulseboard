"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComposerPath } from "@/lib/composer";
import { pathStyle } from "./composer-path-style";

export type ComposerFilmstripProps = {
  photos: { id: string; thumbUrl: string | null; filename: string }[];
  paths: ComposerPath[];
  /** photo id → the paths it has tags in */
  coverage: Record<string, Set<string>>;
  currentIndex: number;
  /** A plain click: go to the photo */
  onJump: (index: number) => void;
  /** Ctrl/⌘-click toggles one photo, Shift-click selects the range from the current photo (S3) */
  selected: Set<string>;
  onSelect: (index: number, how: "toggle" | "range") => void;
  /** Paint mode (S3): a press-and-drag over thumbnails is one stroke; Alt held = eraser */
  painting: boolean;
  onStroke: (photoIds: string[], erase: boolean) => void;
};

/**
 * Where you are in the set, and what is done (ADR-0042): one dot per path under
 * each thumbnail, lit when the photo has a tag in that path. The cursor stays
 * centred. Selected photos carry a tick; in paint mode the strip is the canvas.
 */
export function ComposerFilmstrip({
  photos,
  paths,
  coverage,
  currentIndex,
  onJump,
  selected,
  onSelect,
  painting,
  onStroke,
}: ComposerFilmstripProps) {
  const currentRef = useRef<HTMLButtonElement>(null);
  const stroke = useRef<{ ids: string[]; erase: boolean } | null>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [currentIndex]);

  // A stroke ends wherever the pointer is let go
  useEffect(() => {
    if (!painting) return;
    const end = () => {
      const s = stroke.current;
      stroke.current = null;
      if (s && s.ids.length) onStroke(s.ids, s.erase);
    };
    window.addEventListener("pointerup", end);
    return () => window.removeEventListener("pointerup", end);
  }, [painting, onStroke]);

  const touch = (id: string) => {
    const s = stroke.current;
    if (s && !s.ids.includes(id)) s.ids.push(id);
  };

  return (
    <div
      className={cn(
        "flex gap-1.5 overflow-x-auto border-t border-border/60 bg-card/60 px-3 py-2",
        painting && "cursor-crosshair select-none bg-emerald-500/5",
      )}
      role="tablist"
      aria-label={painting ? "Photos — drag to paint, Alt to erase" : "Photos"}
    >
      {photos.map((p, i) => {
        const active = i === currentIndex;
        const isSelected = selected.has(p.id);
        const done = coverage[p.id] ?? new Set<string>();
        return (
          <button
            key={p.id}
            ref={active ? currentRef : undefined}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${p.filename}: ${done.size} of ${paths.length} paths tagged${isSelected ? ", selected" : ""}`}
            data-testid="composer-strip-photo"
            data-selected={isSelected}
            onPointerDown={(e) => {
              if (!painting) return;
              e.preventDefault();
              stroke.current = { ids: [p.id], erase: e.altKey };
            }}
            onPointerEnter={() => painting && touch(p.id)}
            onClick={(e) => {
              if (painting) return;
              if (e.metaKey || e.ctrlKey) onSelect(i, "toggle");
              else if (e.shiftKey) onSelect(i, "range");
              else onJump(i);
            }}
            className={cn(
              "relative flex shrink-0 flex-col items-center gap-1 rounded p-0.5 transition-opacity duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-primary/15 ring-2 ring-primary" : isSelected ? "ring-2 ring-sky-500" : "opacity-70 hover:opacity-100",
              isSelected && "opacity-100",
            )}
          >
            <span className="block h-14 w-10 overflow-hidden rounded bg-muted">
              {p.thumbUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- MinIO URL
                <img src={p.thumbUrl} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
              )}
            </span>
            {isSelected && (
              <span className="absolute right-0 top-0 rounded-full bg-sky-500 p-0.5 text-white shadow" aria-hidden>
                <Check size={9} />
              </span>
            )}
            <span className="flex gap-0.5" aria-hidden>
              {paths.map((path) => (
                <span key={path.id} className={cn("h-1.5 w-1.5 rounded-full", done.has(path.id) ? pathStyle(path.name).dot : "bg-muted-foreground/25")} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
