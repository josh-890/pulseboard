"use client";

import { Camera, X } from "lucide-react";
import { formatIntensity } from "@/lib/intensity";
import type { GalleryItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { PhotoIntensity } from "./use-photo-intensity";

export type PhotoIntensitySectionProps = {
  intensity: PhotoIntensity;
  item: GalleryItem;
  /** Opens the viewer's act picker (A) */
  onRate?: () => void;
};

// Intensity beside the photo (2026-11-28), in the viewer's info panel: per
// lead on it, the acts ticked in its session — highest first, those this photo
// is evidence for marked, with × to take the photo back (the tick stays).
export function PhotoIntensitySection({ intensity, item, onRate }: PhotoIntensitySectionProps) {
  const { leads, others } = intensity.peopleOn(item);
  const linked = new Set(intensity.linkedOn(item).map((l) => l.key));
  if (leads.length === 0) {
    return (
      <p className="px-1 pb-2 text-xs text-white/45">
        {others.length ? "Only people appearing are on this photo — no intensity." : "None of the session's models is on this photo."}
      </p>
    );
  }
  return (
    <div className="space-y-2.5 px-1 pb-3" data-testid="photo-intensity-section">
      {leads.map((l) => {
        const acts = intensity.actsOf(l.contributionId);
        const top = acts[0]?.level;
        return (
          <div key={l.contributionId}>
            <p className="flex items-baseline justify-between gap-2 text-xs font-medium text-white/80">
              <span className="truncate">{l.label}</span>
              {top !== undefined && (
                <span className="shrink-0 tabular-nums text-white/50" title="Highest act ticked in this session (without extras)">
                  top {formatIntensity(top)}
                </span>
              )}
            </p>
            {acts.length === 0 ? (
              <p className="text-[11px] text-white/40">No act yet.</p>
            ) : (
              <ul className="mt-0.5 space-y-0.5" aria-label={`Acts of ${l.label}`}>
                {acts.map((a) => {
                  const here = linked.has(`${l.contributionId}:${a.id}`);
                  return (
                    <li key={a.id} className={cn("flex items-center gap-1.5 text-[12px]", here ? "text-white" : "text-white/55")}>
                      <span className="w-6 shrink-0 text-right tabular-nums text-white/40">{formatIntensity(a.level)}</span>
                      <span className="min-w-0 flex-1 truncate" title={`${a.scenarioName}${a.description ? ` — ${a.description}` : ""}`}>
                        {a.name}
                      </span>
                      {here && (
                        <>
                          <Camera size={12} className="shrink-0 text-primary" aria-label="this photo is evidence" />
                          <button
                            type="button"
                            onClick={() => intensity.unlink([item], [l.personId], a.id)}
                            aria-label={`Take this photo back from ${a.name} — ${l.label}`}
                            className="rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                          >
                            <X size={11} aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      {onRate && (
        <button
          type="button"
          onClick={onRate}
          className="rounded-md bg-white/10 px-2 py-1 text-[11px] font-medium text-white/80 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          Rate an act on this photo <kbd className="ml-1 font-mono text-[10px] text-white/50">A</kbd>
        </button>
      )}
    </div>
  );
}
