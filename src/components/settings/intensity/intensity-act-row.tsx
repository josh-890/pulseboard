"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { InlineEditable } from "@/components/shared/inline-editable";
import { updateIntensityActAction } from "@/lib/actions/intensity-catalog-actions";
import type { IntensityCatalog } from "@/lib/services/intensity-catalog-service";
import { cn } from "@/lib/utils";
import { IntensityHoverText } from "@/components/intensity/intensity-hover-text";
import { useCatalogCall } from "./use-catalog-call";
import { swallowClickAfterDrag } from "./use-act-board";

export type IntensityActRowProps = {
  act: IntensityCatalog["scenarios"][number]["acts"][number];
  /** Descriptions folded away: only on hover */
  showDescription: boolean;
};

// One act in its cell: its title (what a session offers to tick), the
// description behind it, and how many sessions tick it. The card drags to any
// cell (the board, K1) — that is how its level changes; press and move, or
// focus it and press Space. Fields inside don't start a drag. Its level as a
// number and deleting it move to the act's panel (K2).
const isControl = (t: EventTarget) =>
  !!(t as HTMLElement).closest("input, textarea, button, [data-no-drag]");

export function IntensityActRow({
  act,
  showDescription,
}: IntensityActRowProps) {
  const { call } = useCatalogCall();
  const used = act._count.contributions;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: act.id,
  });

  return (
    <li
      ref={(el) => {
        setNodeRef(el);
        setActivatorNodeRef(el);
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-roledescription="act card"
      aria-label={`${act.name}, level ${act.level} — drag to another cell`}
      // Typing is not a drag
      onMouseDown={(e) => !isControl(e.target) && listeners?.onMouseDown?.(e)}
      onTouchStart={(e) => !isControl(e.target) && listeners?.onTouchStart?.(e)}
      onClickCapture={swallowClickAfterDrag}
      className={cn(
        "group/act bg-muted/30 relative cursor-grab rounded-lg border border-white/10 px-1.5 py-0.5 active:cursor-grabbing",
        "focus-visible:ring-primary/60 outline-none focus-visible:ring-2",
        isDragging && "opacity-30",
      )}
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <IntensityHoverText
            side="top"
            text={showDescription ? null : act.description}
          >
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
        </div>
        {used > 0 && (
          <span
            className="text-muted-foreground shrink-0 pt-1 text-[10px] tabular-nums"
            title={`Ticked in ${used} ${used === 1 ? "session" : "sessions"}`}
          >
            {used}×
          </span>
        )}
      </div>
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
