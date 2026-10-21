"use client";

import { Zap } from "lucide-react";
import { InlineEditable } from "@/components/shared/inline-editable";
import { updateIntensityScaleStepAction } from "@/lib/actions/intensity-catalog-actions";
import { formatIntensity, INTENSITY_MAX } from "@/lib/intensity";
import { cn } from "@/lib/utils";
import { IntensityHoverText } from "@/components/intensity/intensity-hover-text";
import { useCatalogCall } from "./use-catalog-call";

export type IntensityScaleCellProps = {
  value: number;
  title: string | null;
  description: string | null;
  /** Descriptions folded away: only on hover */
  showDescription: boolean;
  /** The Max extra's name, shown on the 10 row */
  maxName: string;
};

// The first column: an intensity value with a title and, in the user's words,
// a description of what it means.
export function IntensityScaleCell({ value, title, description, showDescription, maxName }: IntensityScaleCellProps) {
  const { call } = useCatalogCall();
  const isMax = value === INTENSITY_MAX;
  const isHalf = !Number.isInteger(value);
  const label = formatIntensity(value);

  return (
    <div role="rowheader" aria-label={`Intensity ${label}`} className="flex items-start gap-2">
      <span
        className={cn(
          "w-9 shrink-0 text-right tabular-nums",
          isHalf ? "text-sm leading-7 text-muted-foreground" : "text-base font-bold leading-7",
        )}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {isMax && (
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
              <Zap size={11} aria-hidden="true" /> {maxName}
            </span>
          )}
          <IntensityHoverText text={showDescription ? null : description}>
            <InlineEditable
              value={title ?? ""}
              onSave={(text) => call(() => updateIntensityScaleStepAction(value, { title: text }))}
              placeholder={`Title for ${label}…`}
              className="px-1 py-0.5 text-sm font-medium"
            >
              {title ? (
                <span className={cn(!showDescription && description && "underline decoration-dotted decoration-muted-foreground/50 underline-offset-4")}>
                  {title}
                </span>
              ) : (
                <span className="font-normal italic text-muted-foreground/60">Title for {label}</span>
              )}
            </InlineEditable>
          </IntensityHoverText>
        </div>
        {showDescription && (
          <InlineEditable
            type="textarea"
            value={description ?? ""}
            onSave={(text) => call(() => updateIntensityScaleStepAction(value, { description: text }))}
            placeholder={`What ${label} means…`}
            className="px-1 text-xs text-foreground/80"
          >
            {description ? (
              <span className="whitespace-pre-line">{description}</span>
            ) : (
              <span className="italic text-muted-foreground/60">Describe {label}</span>
            )}
          </InlineEditable>
        )}
      </div>
    </div>
  );
}
