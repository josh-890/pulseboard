"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type IntensityPanelShellProps = {
  /** The landmark's name, e.g. "Act Topless", "Intensity 4.5", "Boundary Shame" */
  label: string;
  /** The heading row's content — usually the inline-editable name */
  heading: ReactNode;
  /** What ↑ / ↓ mean here, e.g. "act" or "step" */
  stepNoun: string;
  onStep: (step: 1 | -1) => void;
  canStep: { prev: boolean; next: boolean };
  onClose: () => void;
  className?: string;
  children: ReactNode;
};

// The frame every catalog panel shares (2026-10-23) — an act, a level, a
// boundary: the name with ↑ ↓ ✕ on top, the fields below. One place to edit,
// one way to move on and to close.
export function IntensityPanelShell({
  label,
  heading,
  stepNoun,
  onStep,
  canStep,
  onClose,
  className,
  children,
}: IntensityPanelShellProps) {
  return (
    <aside
      aria-label={label}
      className={cn(
        "bg-card/90 flex flex-col gap-4 rounded-2xl border border-white/20 p-4 shadow-sm backdrop-blur-md dark:border-white/10",
        className,
      )}
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">{heading}</div>
        <button
          type="button"
          onClick={() => onStep(-1)}
          disabled={!canStep.prev}
          aria-label={`Previous ${stepNoun}`}
          title={`Previous ${stepNoun} (↑)`}
          className="text-muted-foreground hover:text-foreground rounded p-1 disabled:opacity-30"
        >
          <ChevronUp size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onStep(1)}
          disabled={!canStep.next}
          aria-label={`Next ${stepNoun}`}
          title={`Next ${stepNoun} (↓)`}
          className="text-muted-foreground hover:text-foreground rounded p-1 disabled:opacity-30"
        >
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the panel"
          title="Close (Esc)"
          className="text-muted-foreground hover:text-foreground rounded p-1"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {children}
    </aside>
  );
}
