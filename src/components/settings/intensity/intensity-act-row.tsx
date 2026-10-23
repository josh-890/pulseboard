"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  /** Open in the act's panel */
  selected?: boolean;
  onOpen: (id: string) => void;
};

// One act in its cell, a card: its title (what a session offers to tick), the
// description behind it, and how many sessions tick it. Click (or Enter) opens
// its panel (K2); double-click (or F2) renames it right here. It drags to any
// cell (K1) — that is how its level changes; press and move, or Space. A field
// inside doesn't start a drag.
const isControl = (t: EventTarget) =>
  !!(t as HTMLElement).closest("input, textarea, button, [data-no-drag]");

export function IntensityActRow({
  act,
  showDescription,
  selected = false,
  onOpen,
}: IntensityActRowProps) {
  const { call } = useCatalogCall();
  const used = act._count.contributions;
  const [renaming, setRenaming] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: act.id });

  async function rename(text: string) {
    setRenaming(false);
    const name = text.trim();
    if (!name || name === act.name) return;
    await call(() => updateIntensityActAction(act.id, { name })).catch(() =>
      setRenaming(true),
    );
  }

  return (
    <li
      ref={(el) => {
        setNodeRef(el);
        setActivatorNodeRef(el);
      }}
      data-act-id={act.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-roledescription="act card"
      aria-label={`${act.name}, level ${act.level} — open with Enter, drag with Space`}
      aria-current={selected ? "true" : undefined}
      // Typing is not a drag
      onMouseDown={(e) => !isControl(e.target) && listeners?.onMouseDown?.(e)}
      onTouchStart={(e) => !isControl(e.target) && listeners?.onTouchStart?.(e)}
      onKeyDown={(e) => {
        if (isControl(e.target)) return;
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen(act.id);
        } else if (e.key === "F2") {
          e.preventDefault();
          setRenaming(true);
        } else {
          listeners?.onKeyDown?.(e);
        }
      }}
      onClickCapture={swallowClickAfterDrag}
      onClick={(e) => !isControl(e.target) && onOpen(act.id)}
      onDoubleClick={(e) => {
        if (isControl(e.target)) return;
        e.preventDefault();
        setRenaming(true);
      }}
      className={cn(
        "group/act bg-muted/30 relative cursor-grab rounded-lg border border-white/10 px-1.5 py-0.5 active:cursor-grabbing",
        "focus-visible:ring-primary/60 outline-none focus-visible:ring-2",
        selected && "border-primary/60 bg-primary/10 ring-primary/40 ring-1",
        isDragging && "opacity-30",
      )}
    >
      {renaming ? (
        <input
          autoFocus
          defaultValue={act.name}
          aria-label={`Rename ${act.name}`}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => void rename(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setRenaming(false);
            }
          }}
          className="border-primary/30 bg-background focus:ring-primary/50 w-full rounded-md border px-1.5 py-0.5 text-sm outline-none focus:ring-1"
        />
      ) : (
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <IntensityHoverText
              side="top"
              text={showDescription ? null : act.description}
            >
              <span
                aria-label={`Act ${act.name}, level ${act.level}`}
                className={cn(
                  "block px-1 py-0.5 text-sm font-medium",
                  !showDescription &&
                    act.description &&
                    "decoration-muted-foreground/50 underline decoration-dotted underline-offset-4",
                )}
              >
                {act.name}
              </span>
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
      )}
      {showDescription && act.description && !renaming && (
        <p className="text-muted-foreground px-1 pb-0.5 text-xs whitespace-pre-line">
          {act.description}
        </p>
      )}
    </li>
  );
}
