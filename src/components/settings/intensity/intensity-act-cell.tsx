"use client";

import { Fragment, useState } from "react";
import { Plus } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { createIntensityActAction } from "@/lib/actions/intensity-catalog-actions";
import { formatIntensity } from "@/lib/intensity";
import type { IntensityCatalog } from "@/lib/services/intensity-catalog-service";
import { IntensityActRow } from "./intensity-act-row";
import { IntensityAddInput } from "./intensity-add-input";
import { useCatalogCall } from "./use-catalog-call";
import { cellDroppableId } from "./use-act-board";
import { cn } from "@/lib/utils";

export type IntensityActCellProps = {
  scenario: { id: string; name: string };
  level: number;
  acts: IntensityCatalog["scenarios"][number]["acts"];
  showDescriptions: boolean;
  /** A card is being dragged — every cell is a target */
  dragging?: boolean;
  /** A card from another cell would land here: before this act, or at the end (null) */
  dropBeforeId?: string | null;
  /** The act open in the panel */
  selectedId?: string | null;
  onOpen: (id: string) => void;
};

function DropLine() {
  return <li aria-hidden="true" className="bg-primary h-0.5 rounded-full" />;
}

// One cell: the scenario's acts on this level, in their order, and a way to add
// one right here. On the board it takes dropped cards (any card, any cell).
export function IntensityActCell({
  scenario,
  level,
  acts,
  showDescriptions,
  dragging = false,
  dropBeforeId,
  selectedId = null,
  onOpen,
}: IntensityActCellProps) {
  const { call } = useCatalogCall();
  const [adding, setAdding] = useState(false);
  const { setNodeRef } = useDroppable({
    id: cellDroppableId(scenario.id, level),
  });
  const isTarget = dropBeforeId !== undefined;

  return (
    <div
      ref={setNodeRef}
      role="cell"
      aria-label={`${scenario.name} at ${formatIntensity(level)}`}
      className={cn(
        "-m-1 min-h-6 space-y-1 rounded-lg p-1 transition-colors",
        dragging && "ring-1 ring-white/5 ring-inset",
        isTarget && "bg-primary/10 ring-primary/40",
      )}
    >
      <SortableContext
        items={acts.map((a) => a.id)}
        strategy={verticalListSortingStrategy}
      >
        {(acts.length > 0 || isTarget) && (
          <ul className="space-y-1">
            {acts.map((act) => (
              <Fragment key={act.id}>
                {dropBeforeId === act.id && <DropLine />}
                <IntensityActRow
                  act={act}
                  showDescription={showDescriptions}
                  selected={act.id === selectedId}
                  onOpen={onOpen}
                />
              </Fragment>
            ))}
            {dropBeforeId === null && <DropLine />}
          </ul>
        )}
      </SortableContext>
      {adding && !dragging ? (
        <IntensityAddInput
          autoFocus
          placeholder="Act name…"
          label={`Add an act to ${scenario.name} at ${formatIntensity(level)}`}
          onAdd={(name) =>
            call(() => createIntensityActAction(scenario.id, name, level))
          }
          onClose={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label={`New act in ${scenario.name} at ${formatIntensity(level)}`}
          // Hidden while a card is held, but keeping its room — nothing shifts under the pointer
          tabIndex={dragging ? -1 : undefined}
          className={cn(
            dragging && "invisible",
            "text-muted-foreground hover:text-foreground flex h-5 w-full items-center gap-1 rounded-md px-1.5 text-[11px] opacity-0 transition-opacity group-hover/row:opacity-70 hover:bg-white/5 focus-visible:opacity-100 [@media(hover:none)]:opacity-50",
          )}
        >
          <Plus size={11} aria-hidden="true" /> Act
        </button>
      )}
    </div>
  );
}
