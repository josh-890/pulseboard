"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { ComposerPath } from "@/lib/composer";
import { pathStyle } from "./composer-path-style";

export type ComposerFilmstripProps = {
  photos: { id: string; thumbUrl: string | null; filename: string }[];
  paths: ComposerPath[];
  /** photo id → the paths it has tags in */
  coverage: Record<string, Set<string>>;
  currentIndex: number;
  onJump: (index: number) => void;
};

/**
 * Where you are in the set, and what is done (ADR-0042): one dot per path under
 * each thumbnail, lit when the photo has a tag in that path. The cursor stays
 * centred.
 */
export function ComposerFilmstrip({ photos, paths, coverage, currentIndex, onJump }: ComposerFilmstripProps) {
  const currentRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [currentIndex]);

  return (
    <div className="flex gap-1.5 overflow-x-auto border-t border-border/60 bg-card/60 px-3 py-2" role="tablist" aria-label="Photos">
      {photos.map((p, i) => {
        const active = i === currentIndex;
        const done = coverage[p.id] ?? new Set<string>();
        return (
          <button
            key={p.id}
            ref={active ? currentRef : undefined}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${p.filename}: ${done.size} of ${paths.length} paths tagged`}
            onClick={() => onJump(i)}
            data-testid="composer-strip-photo"
            className={cn(
              "flex shrink-0 flex-col items-center gap-1 rounded p-0.5 transition-opacity duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-primary/15 ring-2 ring-primary" : "opacity-70 hover:opacity-100",
            )}
          >
            <span className="block h-14 w-10 overflow-hidden rounded bg-muted">
              {p.thumbUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- MinIO URL
                <img src={p.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
              )}
            </span>
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
