"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { IntensityHoverText } from "@/components/intensity/intensity-hover-text";
import {
  createIntensityBoundaryAction,
  updateIntensityBoundaryAction,
} from "@/lib/actions/intensity-catalog-actions";
import { formatIntensity } from "@/lib/intensity";
import type { IntensityCatalog } from "@/lib/services/intensity-catalog-service";
import { cn } from "@/lib/utils";
import { IntensityAddInput } from "./intensity-add-input";
import { IntensityBoundaryLine } from "./intensity-boundary-line";
import { IntensityRenameInput } from "./intensity-rename-input";
import { useCatalogCall } from "./use-catalog-call";

export type IntensitySeamProps = {
  /** The value just below the seam is crossed into — a boundary here is "at" it */
  value: number;
  boundary: IntensityCatalog["boundaries"][number] | null;
  /** Its band unfolded — to read the description */
  open: boolean;
  onToggle: () => void;
  /** Open in the side panel */
  selected: boolean;
  /** Open the boundary's panel — where it is described and deleted */
  onOpen: (id: string) => void;
  /** The scale column's classes, so the seam's head lines up with it (sticky, opaque) */
  headClassName: string;
  /** The heat strip's colour on this seam — it runs on through */
  stripColor: string;
};

/** The small pill on a seam — "+ Boundary" on hover, a set boundary always */
const PILL =
  "bg-popover focus-visible:ring-ring flex items-center gap-1 rounded-full border border-white/15 px-1.5 text-[10px] leading-4 shadow-sm focus-visible:ring-1 focus-visible:outline-none";

// The seam between two levels (2026-10-23). A boundary there is a line a
// person crosses, or gives up: a dashed line along the seam and, in the
// Intensity column, a pill with its title (its description on hover). The
// column is for reading — ▸ unfolds the description there; a click on the
// pill opens the boundary's panel to edit it, a double-click renames it.
// Without one, hovering the seam in that column offers "+ Boundary".
export function IntensitySeam({
  value,
  boundary,
  open,
  onToggle,
  selected,
  onOpen,
  headClassName,
  stripColor,
}: IntensitySeamProps) {
  const { call } = useCatalogCall();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const at = formatIntensity(value);

  if (!boundary && !adding) {
    return (
      <div className="relative flex h-0" role="presentation">
        {/* Above the next lane's head, so the whole hover zone on the seam reaches it */}
        <div className={cn(headClassName, "z-20 h-0 py-0")}>
          <div className="group/seam absolute inset-x-0 -top-2 z-20 flex h-4 items-center pl-12">
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label={`New boundary at ${at}`}
              className={cn(
                PILL,
                "text-muted-foreground hover:text-foreground opacity-0 transition-opacity group-hover/seam:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:hidden",
              )}
            >
              <Plus size={10} aria-hidden="true" /> Boundary
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!boundary) {
    return (
      <div className="relative flex" role="presentation">
        <div className={cn(headClassName, "py-1")}>
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1.5"
            style={{ backgroundColor: stripColor }}
          />
          <IntensityAddInput
            autoFocus
            placeholder="Name the boundary…"
            label={`Name the boundary at ${at}`}
            onAdd={async (title) => {
              const result = await createIntensityBoundaryAction(value, title);
              if (!result.success) {
                toast.error(result.error ?? "Could not add the boundary");
                throw new Error(result.error);
              }
              setAdding(false);
              if (result.id) onOpen(result.id); // describe it right away
            }}
            onClose={() => setAdding(false)}
            className="pl-2"
          />
        </div>
        <div className="border-foreground/25 min-w-0 flex-1 self-center border-t-2 border-dashed" />
      </div>
    );
  }

  const chevron = (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${open ? "Fold" : "Unfold"} the boundary ${boundary.title}`}
      className="text-muted-foreground hover:text-foreground bg-popover shrink-0 rounded-full p-0.5"
    >
      {open ? (
        <ChevronDown size={10} aria-hidden="true" />
      ) : (
        <ChevronRight size={10} aria-hidden="true" />
      )}
    </button>
  );

  const pill = renaming ? (
    <IntensityRenameInput
      value={boundary.title}
      label={`Rename the boundary ${boundary.title}`}
      onSave={(title) =>
        void call(() =>
          updateIntensityBoundaryAction(boundary.id, { title }),
        ).catch(() => {})
      }
      onDone={() => setRenaming(false)}
      className="border-primary/30 bg-background focus:ring-primary/50 h-5 w-40 rounded-full border px-2 text-[11px] outline-none focus:ring-1"
    />
  ) : (
    <IntensityHoverText side="right" text={open ? null : boundary.description} className="min-w-0" tone="boundary">
      <button
        type="button"
        data-boundary-id={boundary.id}
        onClick={() => onOpen(boundary.id)}
        onDoubleClick={(e) => {
          e.preventDefault();
          setRenaming(true);
        }}
        aria-label={`Boundary ${boundary.title} — open it`}
        aria-current={selected ? "true" : undefined}
        className={cn(
          PILL,
          "text-foreground hover:border-primary/40 max-w-full font-medium",
          selected && "border-primary/60 ring-primary/40 ring-1",
        )}
      >
        <span aria-hidden="true">◆</span>
        <span className="truncate">{boundary.title}</span>
      </button>
    </IntensityHoverText>
  );

  // Folded: the pill on the seam, the dashed line along it — the lanes don't move
  if (!open) {
    return (
      <div
        role="separator"
        aria-label={`Boundary at ${at}: ${boundary.title}`}
        className="relative flex h-0"
      >
        <div className={cn(headClassName, "z-20 h-0 py-0")}>
          <div className="absolute inset-x-0 -top-2 flex h-4 items-center gap-0.5 pl-7">
            {chevron}
            {pill}
          </div>
        </div>
        <IntensityBoundaryLine title={boundary.title} description={boundary.description} />
      </div>
    );
  }

  // Unfolded: a band in the column to read what the boundary means
  return (
    <div
      role="separator"
      aria-label={`Boundary at ${at}: ${boundary.title}`}
      className="relative flex"
    >
      <div className={cn(headClassName, "py-1")}>
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ backgroundColor: stripColor }}
        />
        <div className="flex items-center gap-0.5 pl-5">
          {chevron}
          {pill}
        </div>
        <button
          type="button"
          onClick={() => onOpen(boundary.id)}
          className="text-muted-foreground hover:bg-muted/40 mt-1 ml-8 block rounded-md px-1 pb-1 text-left text-xs"
        >
          {boundary.description ? (
            <span className="whitespace-pre-line">{boundary.description}</span>
          ) : (
            <span className="italic opacity-60">
              No description — open to write one
            </span>
          )}
        </button>
      </div>
      <div className="flex min-w-0 flex-1 self-start pt-[0.85rem]">
        <IntensityBoundaryLine title={boundary.title} description={boundary.description} />
      </div>
    </div>
  );
}
