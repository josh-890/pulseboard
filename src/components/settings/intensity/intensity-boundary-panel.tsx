"use client";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { InlineEditable } from "@/components/shared/inline-editable";
import {
  createIntensityBoundaryAction,
  deleteIntensityBoundaryAction,
  updateIntensityBoundaryAction,
} from "@/lib/actions/intensity-catalog-actions";
import { formatIntensity, INTENSITY_STEP } from "@/lib/intensity";
import type { IntensityCatalog } from "@/lib/services/intensity-catalog-service";
import { IntensityPanelShell } from "./intensity-panel-shell";
import { useCatalogCall } from "./use-catalog-call";

export type IntensityBoundaryPanelProps = {
  boundary: IntensityCatalog["boundaries"][number];
  /** The level just above the seam's lower side, as the board shows it (e.g. 4 for a boundary at 5 without half steps) */
  below: number | null;
  onClose: () => void;
  onStep: (step: 1 | -1) => void;
  canStep: { prev: boolean; next: boolean };
  className?: string;
};

const LABEL = "text-muted-foreground block text-xs font-medium";

// A boundary's panel (2026-10-23): its name, and what is crossed — or given
// up — there; delete with Undo. ↑ / ↓ walk down the scale, levels included.
export function IntensityBoundaryPanel({
  boundary,
  below,
  onClose,
  onStep,
  canStep,
  className,
}: IntensityBoundaryPanelProps) {
  const { call, run } = useCatalogCall();
  const at = formatIntensity(boundary.value);
  const from = formatIntensity(below ?? boundary.value - INTENSITY_STEP);

  function remove() {
    const { value, title, description } = boundary;
    onClose();
    run(() => deleteIntensityBoundaryAction(boundary.id));
    toast(`Boundary “${title}” removed`, {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: () =>
          run(() => createIntensityBoundaryAction(value, title, description)),
      },
    });
  }

  return (
    <IntensityPanelShell
      label={`Boundary ${boundary.title}`}
      heading={
        <InlineEditable
          value={boundary.title}
          onSave={(title) =>
            call(() => updateIntensityBoundaryAction(boundary.id, { title }))
          }
          className="px-1 text-base font-semibold"
        >
          <h3 className="break-words">◆ {boundary.title}</h3>
        </InlineEditable>
      }
      stepNoun="step"
      onStep={onStep}
      canStep={canStep}
      onClose={onClose}
      className={className}
    >
      <p className="text-muted-foreground text-xs">
        Between {from} and {at} — crossed on the way into {at}.
      </p>

      <div className="space-y-1">
        <span className={LABEL}>What is crossed or given up here</span>
        <InlineEditable
          type="textarea"
          value={boundary.description ?? ""}
          onSave={(description) =>
            call(() =>
              updateIntensityBoundaryAction(boundary.id, { description }),
            )
          }
          placeholder="What is given up here…"
          className="px-1 text-sm"
        >
          {boundary.description ? (
            <span className="whitespace-pre-line">{boundary.description}</span>
          ) : (
            <span className="text-muted-foreground italic">
              Describe the boundary
            </span>
          )}
        </InlineEditable>
      </div>

      <div className="mt-auto border-t border-white/10 pt-3">
        <button
          type="button"
          onClick={remove}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm"
        >
          <Trash2 size={14} aria-hidden="true" /> Delete boundary
        </button>
      </div>
    </IntensityPanelShell>
  );
}
