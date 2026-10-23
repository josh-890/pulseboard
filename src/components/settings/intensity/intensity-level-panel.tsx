"use client";

import { Zap } from "lucide-react";
import { InlineEditable } from "@/components/shared/inline-editable";
import { IntensityValue } from "@/components/intensity/intensity-value";
import { updateIntensityScaleStepAction } from "@/lib/actions/intensity-catalog-actions";
import { formatIntensity } from "@/lib/intensity";
import { IntensityPanelShell } from "./intensity-panel-shell";
import { useCatalogCall } from "./use-catalog-call";

export type IntensityLevelPanelProps = {
  value: number;
  max: number;
  title: string | null;
  description: string | null;
  /** The Max extra's name, for the Max row */
  maxName: string;
  /** The acts on this level, by scenario */
  acts: { id: string; name: string; scenario: string }[];
  onOpenAct: (id: string) => void;
  onClose: () => void;
  onStep: (step: 1 | -1) => void;
  canStep: { prev: boolean; next: boolean };
  className?: string;
};

const LABEL = "text-muted-foreground block text-xs font-medium";

// A level's panel (2026-10-23): its title — what a session offers — and in the
// user's words what it means; the acts that sit on it, each opening its own
// panel. ↑ / ↓ walk down the scale, boundaries included.
export function IntensityLevelPanel({
  value,
  max,
  title,
  description,
  maxName,
  acts,
  onOpenAct,
  onClose,
  onStep,
  canStep,
  className,
}: IntensityLevelPanelProps) {
  const { call } = useCatalogCall();
  const label = formatIntensity(value);

  return (
    <IntensityPanelShell
      label={`Intensity ${label}`}
      heading={
        <div className="flex items-center gap-2">
          <IntensityValue value={value} max={max} className="text-sm" />
          <InlineEditable
            value={title ?? ""}
            onSave={(text) =>
              call(() => updateIntensityScaleStepAction(value, { title: text }))
            }
            placeholder={`Title for ${label}…`}
            className="min-w-0 flex-1 px-1 text-base font-semibold"
          >
            {title ? (
              <h3 className="break-words">{title}</h3>
            ) : (
              <h3 className="text-muted-foreground/60 font-normal italic">
                Title for {label}
              </h3>
            )}
          </InlineEditable>
        </div>
      }
      stepNoun="step"
      onStep={onStep}
      canStep={canStep}
      onClose={onClose}
      className={className}
    >
      {value === max && (
        <p className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
          <Zap size={12} aria-hidden="true" /> {maxName} sets this value,
          whatever the act and the other extras.
        </p>
      )}

      <div className="space-y-1">
        <span className={LABEL}>Description</span>
        <InlineEditable
          type="textarea"
          value={description ?? ""}
          onSave={(text) =>
            call(() =>
              updateIntensityScaleStepAction(value, { description: text }),
            )
          }
          placeholder={`What ${label} means…`}
          className="px-1 text-sm"
        >
          {description ? (
            <span className="whitespace-pre-line">{description}</span>
          ) : (
            <span className="text-muted-foreground italic">
              Describe {label}
            </span>
          )}
        </InlineEditable>
      </div>

      {value < max && (
        <div className="space-y-1.5">
          <span className={LABEL}>
            {acts.length} {acts.length === 1 ? "act" : "acts"} on this level
          </span>
          {acts.length > 0 && (
            <ul aria-label={`Acts at ${label}`} className="space-y-1">
              {acts.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onOpenAct(a.id)}
                    className="hover:bg-muted/40 block w-full rounded-md px-1.5 py-1 text-left text-sm"
                  >
                    <span className="font-medium">{a.name}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {a.scenario}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </IntensityPanelShell>
  );
}
