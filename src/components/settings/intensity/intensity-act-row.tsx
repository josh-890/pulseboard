"use client";

import { useEffect } from "react";
import { Trash2 } from "lucide-react";
import { InlineEditable } from "@/components/shared/inline-editable";
import {
  deleteIntensityActAction,
  updateIntensityActAction,
} from "@/lib/actions/intensity-catalog-actions";
import type { IntensityCatalog } from "@/lib/services/intensity-catalog-service";
import { cn } from "@/lib/utils";
import { IntensityHoverText } from "@/components/intensity/intensity-hover-text";
import { IntensityStepInput } from "./intensity-step-input";
import { useCatalogCall } from "./use-catalog-call";

export type IntensityActRowProps = {
  act: IntensityCatalog["scenarios"][number]["acts"][number];
  /** Descriptions folded away: only on hover */
  showDescription: boolean;
};

// One act in its cell: its title (what a session offers to tick) and the
// description behind it; the level field moves it to another row; delete
// while no session has it ticked.
// A new level moves the act to another row, which mounts it afresh; this
// remembers whose level field had the cursor, and for which level, so the
// act arriving on that row takes it back (the old one may re-render first).
let keepLevelFocus: { id: string; level: number } | null = null;

export function IntensityActRow({
  act,
  showDescription,
}: IntensityActRowProps) {
  const { call, run } = useCatalogCall();
  const used = act._count.contributions;
  const refocus =
    keepLevelFocus?.id === act.id && keepLevelFocus.level === act.level;

  // Children's effects run first: the field has taken the focus by now
  useEffect(() => {
    if (refocus) keepLevelFocus = null;
  }, [refocus]);

  return (
    <li className="group/act bg-muted/30 relative rounded-lg border border-white/10 px-1.5 py-0.5">
      {/* Level and delete float right of the card, level with it, on hover or focus — the title keeps the full width.
          The padding (not a margin) bridges the gap so the hover holds while the pointer crosses over. */}
      <div className="absolute top-1/2 left-full z-20 -translate-y-1/2 pl-1 opacity-0 transition-opacity group-hover/act:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <div className="bg-popover flex items-center gap-0.5 rounded-md border border-white/15 px-0.5 py-0.5 shadow-md">
          {used > 0 && (
            <span
              className="text-muted-foreground px-1 text-[10px]"
              title={`Ticked in ${used} ${used === 1 ? "session" : "sessions"}`}
            >
              {used}×
            </span>
          )}
          <IntensityStepInput
            key={act.level}
            value={act.level}
            label={`Level of ${act.name}`}
            onCommit={(level) => {
              keepLevelFocus = { id: act.id, level };
              return call(() => updateIntensityActAction(act.id, { level }));
            }}
            autoFocus={refocus}
          />
          <button
            type="button"
            onClick={() => run(() => deleteIntensityActAction(act.id))}
            disabled={used > 0}
            aria-label={`Delete ${act.name}`}
            title={used > 0 ? "Ticked in sessions — cannot delete" : "Delete"}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0 rounded p-1 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Trash2 size={12} aria-hidden="true" />
          </button>
        </div>
      </div>
      <IntensityHoverText side="top" text={showDescription ? null : act.description}>
        <InlineEditable
          value={act.name}
          onSave={(name) =>
            call(() => updateIntensityActAction(act.id, { name }))
          }
          className="px-1 text-sm font-medium"
        >
          <span
            aria-label={`Act ${act.name}, level ${act.level}`}
            className={cn(
              !showDescription &&
                act.description &&
                "decoration-muted-foreground/50 underline decoration-dotted underline-offset-4",
            )}
          >
            {act.name}
          </span>
        </InlineEditable>
      </IntensityHoverText>
      {showDescription && (
        <InlineEditable
          type="textarea"
          value={act.description ?? ""}
          onSave={(description) =>
            call(() => updateIntensityActAction(act.id, { description }))
          }
          placeholder="What it means…"
          className="text-muted-foreground px-1 pb-0.5 text-xs"
        >
          {act.description ? (
            <span className="whitespace-pre-line">{act.description}</span>
          ) : (
            <span className="italic opacity-60">Add a description</span>
          )}
        </InlineEditable>
      )}
    </li>
  );
}
