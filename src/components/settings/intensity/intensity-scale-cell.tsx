"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Zap } from "lucide-react";
import { updateIntensityScaleStepAction } from "@/lib/actions/intensity-catalog-actions";
import { formatIntensity } from "@/lib/intensity";
import { cn } from "@/lib/utils";
import { IntensityHoverText } from "@/components/intensity/intensity-hover-text";
import { useCatalogCall } from "./use-catalog-call";
import { IntensityRenameInput } from "./intensity-rename-input";

export type IntensityScaleCellProps = {
  /** A held card is over this lane */
  active?: boolean;
  value: number;
  title: string | null;
  description: string | null;
  /** The description unfolded — this one, or all with "Descriptions"; folded it shows on hover */
  showDescription: boolean;
  /** Unfold or fold this value's description on its own */
  onToggleDescription: () => void;
  /** The Max extra's name, shown on the Max row */
  maxName: string;
  /** The top of the scale — this row is Max when it equals it */
  max: number;
  /** Open in the side panel */
  selected?: boolean;
  /** Open this level's panel — where its title and description are edited */
  onOpen: () => void;
};

// The first column: an intensity value with a title and, in the user's words,
// a description of what it means — to read here (unfolded by its ▸, or all with
// "Descriptions"); a click opens the level's panel to edit them, a double-click
// renames it in place (2026-10-23).
export function IntensityScaleCell({
  value,
  title,
  description,
  showDescription,
  onToggleDescription,
  maxName,
  max,
  active = false,
  selected = false,
  onOpen,
}: IntensityScaleCellProps) {
  const { call } = useCatalogCall();
  const [renaming, setRenaming] = useState(false);
  const isMax = value === max;
  const isHalf = !Number.isInteger(value);
  const label = formatIntensity(value);

  return (
    <div
      role="rowheader"
      aria-label={`Intensity ${label}`}
      className="flex items-start gap-2"
    >
      {/* The colour is the strip at the column's edge; the number stays plain and steady */}
      <span
        className={cn(
          "w-9 shrink-0 text-right tabular-nums",
          isHalf
            ? "text-muted-foreground text-sm leading-7"
            : "text-base leading-7 font-bold",
          active && "text-primary font-bold",
        )}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleDescription}
            aria-expanded={showDescription}
            aria-label={`${showDescription ? "Fold" : "Open"} the description of ${label}`}
            className={cn(
              "text-muted-foreground hover:text-foreground -ml-1 shrink-0 rounded p-0.5 transition-opacity",
              !description &&
                !showDescription &&
                "opacity-0 group-hover/row:opacity-60 focus-visible:opacity-100",
            )}
          >
            {showDescription ? (
              <ChevronDown size={12} aria-hidden="true" />
            ) : (
              <ChevronRight size={12} aria-hidden="true" />
            )}
          </button>
          {isMax && (
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
              <Zap size={11} aria-hidden="true" /> {maxName}
            </span>
          )}
          {renaming ? (
            <IntensityRenameInput
              value={title ?? ""}
              label={`Rename ${label}`}
              onSave={(text) =>
                void call(() =>
                  updateIntensityScaleStepAction(value, { title: text }),
                ).catch(() => {})
              }
              onDone={() => setRenaming(false)}
            />
          ) : (
            <IntensityHoverText text={showDescription ? null : description}>
              <button
                type="button"
                data-level={label}
                onClick={onOpen}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  setRenaming(true);
                }}
                aria-label={`${title ?? `Title for ${label}`} — open ${label}`}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "hover:bg-muted/40 min-w-0 rounded-md px-1 py-0.5 text-left text-sm font-medium",
                  selected && "bg-primary/10 ring-primary/40 ring-1",
                )}
              >
                {title ? (
                  <span
                    className={cn(
                      !showDescription &&
                        description &&
                        "decoration-muted-foreground/50 underline decoration-dotted underline-offset-4",
                    )}
                  >
                    {title}
                  </span>
                ) : (
                  <span className="text-muted-foreground/60 font-normal italic">
                    Title for {label}
                  </span>
                )}
              </button>
            </IntensityHoverText>
          )}
        </div>
        {showDescription && (
          <button
            type="button"
            onClick={onOpen}
            className="text-foreground/80 hover:bg-muted/40 ml-4 block rounded-md px-1 text-left text-xs"
          >
            {description ? (
              <span className="whitespace-pre-line">{description}</span>
            ) : (
              <span className="text-muted-foreground/60 italic">
                No description — open to write one
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
