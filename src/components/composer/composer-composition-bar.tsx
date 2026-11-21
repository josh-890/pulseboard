"use client";

import { Brush, CornerDownLeft, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Composition } from "@/lib/composer";

export type ComposerCompositionBarProps = {
  mode: "selection" | "paint";
  comp: Composition;
  /** Photos selected (selection mode) */
  count: number;
  name: (tagId: string) => string;
  busy: boolean;
  onApply: () => void;
  onClear: () => void;
};

/**
 * The footer while the Composer edits one change for many photos (ADR-0042, S3):
 * what will be added and removed, and how it lands — Apply on a selection, or
 * the brush that paints over the filmstrip.
 */
export function ComposerCompositionBar({ mode, comp, count, name, busy, onApply, onClear }: ComposerCompositionBarProps) {
  const empty = comp.adds.length + comp.removes.length === 0;
  return (
    <footer className="space-y-2 border-t border-border/60 p-3">
      <div className="flex min-h-[1.5rem] flex-wrap items-center gap-1 text-[11px]" data-testid="composer-composition" aria-live="polite">
        {empty ? (
          <span className="text-muted-foreground">
            {mode === "paint" ? "Pick tags for the brush." : `Pick tags — one change for all ${count} photos.`}
          </span>
        ) : (
          <>
            {comp.adds.map((id) => (
              <span key={id} className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
                + {name(id)}
              </span>
            ))}
            {comp.removes.map((id) => (
              <span key={id} className="rounded-full border border-rose-500/50 bg-rose-500/10 px-1.5 py-0.5 text-rose-700 dark:text-rose-300">
                − {name(id)}
              </span>
            ))}
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onClear} disabled={empty || busy} className="gap-1">
          <X size={14} /> Clear
        </Button>
        {mode === "selection" ? (
          <Button size="sm" onClick={onApply} disabled={empty || busy} className="ml-auto gap-1.5" data-testid="composer-apply-selection">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CornerDownLeft size={14} />}
            Apply to {count} photos
          </Button>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Brush size={14} aria-hidden /> Drag over the filmstrip · Alt erases
          </span>
        )}
      </div>
    </footer>
  );
}
