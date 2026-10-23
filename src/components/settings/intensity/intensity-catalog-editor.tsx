"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DndContext, DragOverlay, MeasuringStrategy } from "@dnd-kit/core";
import { createIntensityScenarioAction } from "@/lib/actions/intensity-catalog-actions";
import { INTENSITY_CAP, INTENSITY_MAX, intensityRows } from "@/lib/intensity";
import type { IntensityCatalog } from "@/lib/services/intensity-catalog-service";
import { cn } from "@/lib/utils";
import { IntensityActCell } from "./intensity-act-cell";
import { IntensityAddInput } from "./intensity-add-input";
import { IntensityExtrasPanel } from "./intensity-extras-panel";
import { IntensityScaleCell } from "./intensity-scale-cell";
import { IntensityScenarioHeader } from "./intensity-scenario-header";
import { useCatalogCall } from "./use-catalog-call";
import { cellKey, useActBoard } from "./use-act-board";
import { IntensityDragCard } from "./intensity-drag-card";

export type IntensityCatalogEditorProps = {
  catalog: IntensityCatalog;
};

const SCALE_COL = "sticky left-0 z-10 w-64 shrink-0 bg-card px-3 py-1.5";
const SCENARIO_COL = "w-56 shrink-0 px-2 py-1.5";
/** A scenario worked in alone takes all the width beside the scale */
const FOCUSED_COL = "min-w-0 flex-1 px-2 py-1.5";

// Settings → Catalogs → Intensity (ADR-0036): a board. Lanes are intensity
// values, lowest first; the first column says what each means, and every act
// is a card in its scenario's column on the lane of its level — drag it to any
// cell (K1, 2026-10-23); while dragging, every half step is a lane. Then the extras.
export function IntensityCatalogEditor({
  catalog,
}: IntensityCatalogEditorProps) {
  const { call } = useCatalogCall();
  const { scale, scenarios, groups, extras } = catalog;
  const [showHalfSteps, setShowHalfSteps] = useState(false);
  const [showDescriptions, setShowDescriptions] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focused = scenarios.find((s) => s.id === focusedId) ?? null;
  const shown = focused ? [focused] : scenarios;
  const col = focused ? FOCUSED_COL : SCENARIO_COL;
  const maxName = extras.find((e) => e.isMax)?.name ?? "Max";

  const board = useActBoard(catalog);
  const { layout, acts, dragging } = board;
  const steps = useMemo(() => new Map(scale.map((s) => [s.value, s])), [scale]);
  // Lanes from the board as it stands — a card dropped on a new half step keeps its lane
  const rows = useMemo(
    () =>
      intensityRows(
        scale.map((s) => s.value),
        Object.entries(layout)
          .filter(([, ids]) => ids.length > 0)
          .map(([key]) => Number(key.slice(key.lastIndexOf("|") + 1))),
        showHalfSteps || dragging,
      ),
    [scale, layout, showHalfSteps, dragging],
  );
  const cellActs = (scenarioId: string, level: number) =>
    (layout[cellKey(scenarioId, level)] ?? []).flatMap((id) => {
      const act = acts.get(id);
      return act ? [act] : [];
    });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Scale and acts</h2>
            <p className="text-muted-foreground text-sm">
              Give each value a title and say what it means; acts sit on the row
              of their level (0 to {INTENSITY_CAP} in half steps). A title is
              what a session offers to tick, its description shows on hover.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="text-muted-foreground flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={showDescriptions}
                onChange={(e) => setShowDescriptions(e.target.checked)}
                className="accent-primary h-3.5 w-3.5"
              />
              Descriptions
            </label>
            <label className="text-muted-foreground flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={showHalfSteps}
                onChange={(e) => setShowHalfSteps(e.target.checked)}
                className="accent-primary h-3.5 w-3.5"
              />
              Half steps
            </label>
          </div>
        </div>

        <DndContext
          id="intensity-board"
          {...board.dnd}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        >
          <div className="bg-card/70 overflow-x-auto rounded-2xl border border-white/20 shadow-sm backdrop-blur-md dark:border-white/10">
            <div
              role="table"
              aria-label="Intensity matrix"
              className={focused ? "w-full" : "w-max min-w-full"}
            >
              <div role="row" className="flex border-b border-white/15">
                <div
                  role="columnheader"
                  className={cn(SCALE_COL, "text-sm font-semibold")}
                >
                  Intensity
                </div>
                {shown.map((s) => {
                  const i = scenarios.indexOf(s);
                  return (
                    <div key={s.id} className={col}>
                      <IntensityScenarioHeader
                        scenario={s}
                        isFirst={i === 0}
                        isLast={i === scenarios.length - 1}
                        focused={s.id === focusedId}
                        onFocusChange={(on) => setFocusedId(on ? s.id : null)}
                      />
                    </div>
                  );
                })}
                {!focused && (
                  <div className={cn(SCENARIO_COL, "w-52")}>
                    <IntensityAddInput
                      placeholder="New scenario…"
                      label="Add a scenario"
                      onAdd={(name) =>
                        call(() => createIntensityScenarioAction(name))
                      }
                    />
                  </div>
                )}
              </div>

              {rows.map((value) => {
                const isMax = value === INTENSITY_MAX;
                const lit = board.overLevel === value;
                return (
                  <div
                    key={value}
                    role="row"
                    className={cn(
                      "group/row flex border-b border-white/10 last:border-b-0",
                      !Number.isInteger(value) && "bg-muted/10",
                      isMax && "bg-amber-500/5",
                      lit && "bg-primary/10",
                    )}
                  >
                    {/* Sticky, so opaque: the lit tint and an accent bar sit on top of its card background */}
                    <div
                      className={cn(
                        SCALE_COL,
                        lit &&
                          "before:bg-primary/15 shadow-[inset_3px_0_0_var(--color-primary)] before:pointer-events-none before:absolute before:inset-0 before:content-['']",
                      )}
                    >
                      <IntensityScaleCell
                        value={value}
                        title={steps.get(value)?.title ?? null}
                        description={steps.get(value)?.description ?? null}
                        showDescription={showDescriptions}
                        maxName={maxName}
                        active={lit}
                      />
                    </div>
                    {shown.map((s) => (
                      <div key={s.id} className={col}>
                        {!isMax && (
                          <IntensityActCell
                            scenario={s}
                            level={value}
                            acts={cellActs(s.id, value)}
                            showDescriptions={showDescriptions}
                            dragging={dragging}
                            dropBeforeId={
                              board.target?.cell === cellKey(s.id, value)
                                ? board.target.beforeId
                                : undefined
                            }
                          />
                        )}
                      </div>
                    ))}
                    {!focused && <div className={cn(SCENARIO_COL, "w-52")} />}
                  </div>
                );
              })}
            </div>
          </div>
          {/* In the body: the board's backdrop blur would otherwise offset it from the pointer */}
          {board.activeAct && board.follow && (
            <IntensityDragCard
              name={board.activeAct.name}
              start={board.follow.start}
              grip={board.follow.grip}
              width={board.follow.width}
            />
          )}
          {dragging &&
            createPortal(
              // Mounted for every drag, so the source card stays put; it draws the card only for the keyboard
              <DragOverlay dropAnimation={null}>
                {board.activeAct && !board.follow && (
                  <div className="bg-popover border-primary/40 w-52 cursor-grabbing rounded-lg border px-2.5 py-1 text-sm font-medium shadow-lg">
                    {board.activeAct.name}
                  </div>
                )}
              </DragOverlay>,
              document.body,
            )}
        </DndContext>
      </div>

      <div className="space-y-2">
        <h2 className="text-base font-semibold">Extras</h2>
        <p className="text-muted-foreground text-sm">
          Points added to an act&apos;s level. Set once per person in a session,
          every act there inherits them and can depart from them. The sum never
          goes above {INTENSITY_CAP}; only {maxName} reaches 10.
        </p>
        <IntensityExtrasPanel groups={groups} extras={extras} />
      </div>
    </div>
  );
}
