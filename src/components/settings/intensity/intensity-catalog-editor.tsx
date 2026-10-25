"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { DndContext, DragOverlay, MeasuringStrategy } from "@dnd-kit/core";
import { createIntensityScenarioAction } from "@/lib/actions/intensity-catalog-actions";
import {
  formatIntensity,
  intensityCap,
  intensityColor,
  intensityRows,
} from "@/lib/intensity";
import type { IntensityCatalog } from "@/lib/services/intensity-catalog-service";
import { cn } from "@/lib/utils";
import { IntensityActCell } from "./intensity-act-cell";
import { IntensityAddInput } from "./intensity-add-input";
import { IntensityExtrasPanel } from "./intensity-extras-panel";
import { IntensityPresetsPanel } from "./intensity-presets-panel";
import { IntensityScaleCell } from "./intensity-scale-cell";
import { IntensityScenarioHeader } from "./intensity-scenario-header";
import { useCatalogCall } from "./use-catalog-call";
import { cellKey, useActBoard } from "./use-act-board";
import { IntensityDragCard } from "./intensity-drag-card";
import { IntensityActPanel } from "./intensity-act-panel";
import { IntensityMaxInput } from "./intensity-max-input";
import { IntensitySeam } from "./intensity-seam";
import {
  useActSelection,
  useWideScreen,
  type CatalogSelection,
} from "./use-act-selection";
import { IntensityLevelPanel } from "./intensity-level-panel";
import { IntensityBoundaryPanel } from "./intensity-boundary-panel";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export type IntensityCatalogEditorProps = {
  catalog: IntensityCatalog;
};

// Sticky over scrolling columns, so opaque: the translucent card colour laid over the page background
const SCALE_COL =
  "sticky left-0 z-10 w-64 shrink-0 [background:linear-gradient(var(--card),var(--card)),var(--background)] px-3 py-1.5";
const SCENARIO_COL = "w-56 shrink-0 px-2 py-1.5";
/** Every other scenario column a shade darker — a hint, like a table's stripes on their side */
const ALT_COL = "bg-foreground/[0.03]";
/** A lane's tint: its heat colour at a few percent, so the lanes read apart without a frame */
const laneTint = (value: number, max: number) => `color-mix(in srgb, ${intensityColor(value, max)} 7%, transparent)`;
/** A scenario worked in alone takes all the width beside the scale */
const FOCUSED_COL = "min-w-0 flex-1 px-2 py-1.5";

// Settings → Catalogs → Intensity (ADR-0036): a board. Lanes are intensity
// values, lowest first; the first column says what each means, and every act
// is a card in its scenario's column on the lane of its level — drag it to any
// cell (K1, 2026-10-23); while dragging, every half step is a lane. A click
// opens the act's panel beside the board (K2): ↑/↓ walk the cards, Esc closes.
// Then the extras.
export function IntensityCatalogEditor({
  catalog,
}: IntensityCatalogEditorProps) {
  const { call } = useCatalogCall();
  const { scale, boundaries, scenarios, groups, extras } = catalog;
  const [showHalfSteps, setShowHalfSteps] = useState(false);
  const [showDescriptions, setShowDescriptions] = useState(false);
  // A value's description, unfolded on its own (all with "Descriptions")
  const [openSteps, setOpenSteps] = useState<Set<number>>(() => new Set());
  const toggleStep = (value: number) =>
    setOpenSteps((s) => {
      const next = new Set(s);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  // Boundaries between the lanes: all open with the switch, or one by one
  const [showBoundaries, setShowBoundaries] = useState(false);
  const [openBoundaries, setOpenBoundaries] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleBoundary = (id: string) =>
    setOpenBoundaries((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focused = scenarios.find((s) => s.id === focusedId) ?? null;
  const shown = focused ? [focused] : scenarios;
  const col = focused ? FOCUSED_COL : SCENARIO_COL;
  const maxName = extras.find((e) => e.isMax)?.name ?? "Max";
  const max = catalog.max;
  const cap = intensityCap(max);

  const board = useActBoard(catalog);
  const { layout, acts, dragging } = board;
  const steps = useMemo(() => new Map(scale.map((s) => [s.value, s])), [scale]);
  const boundaryAt = useMemo(
    () => new Map(boundaries.map((b) => [b.value, b])),
    [boundaries],
  );
  // Lanes from the board as it stands — a card dropped on a new half step keeps its lane
  const rows = useMemo(
    () =>
      intensityRows(
        // A boundary's lane shows, so its seam has a place
        [...scale.map((s) => s.value), ...boundaries.map((b) => b.value)],
        Object.entries(layout)
          .filter(([, ids]) => ids.length > 0)
          .map(([key]) => Number(key.slice(key.lastIndexOf("|") + 1))),
        showHalfSteps || dragging,
        max,
      ),
    [scale, boundaries, layout, showHalfSteps, dragging, max],
  );
  const known = useMemo(
    () => ({
      acts: new Set(acts.keys()),
      boundaries: new Set(boundaries.map((b) => b.id)),
    }),
    [acts, boundaries],
  );
  const shownIds = useMemo(
    () => (focused ? [focused.id] : scenarios.map((s) => s.id)),
    [focused, scenarios],
  );
  // The scale from the top, as ↑/↓ walk it in a level's or a boundary's panel
  const scaleOrder = useMemo<CatalogSelection[]>(
    () =>
      rows.flatMap((v) => {
        const b = boundaryAt.get(v);
        return [
          ...(b ? [{ kind: "boundary" as const, key: b.id }] : []),
          { kind: "level" as const, key: String(v) },
        ];
      }),
    [rows, boundaryAt],
  );
  const selection = useActSelection(layout, shownIds, rows, known, scaleOrder);
  const sel = selection.selected;
  const selectedAct = sel?.kind === "act" ? (acts.get(sel.key) ?? null) : null;
  const selectedLevel = sel?.kind === "level" ? Number(sel.key) : null;
  const selectedBoundary =
    sel?.kind === "boundary"
      ? (boundaries.find((b) => b.id === sel.key) ?? null)
      : null;
  const wide = useWideScreen();

  const elementOf = (s: CatalogSelection) =>
    document.querySelector<HTMLElement>(
      s.kind === "act"
        ? `[data-act-id="${s.key}"]`
        : s.kind === "level"
          ? `[data-level="${formatIntensity(Number(s.key))}"]`
          : `[data-boundary-id="${s.key}"]`,
    );

  function step(dir: 1 | -1) {
    const next = selection.neighbour(dir);
    if (!next) return;
    selection.select(next);
    elementOf(next)?.focus();
  }

  // The open card, level or boundary in view — after a link, or one chosen off-screen
  useEffect(() => {
    if (!sel) return;
    elementOf(sel)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [sel?.kind, sel?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // With a panel open: ↑/↓ the next of its kind, Esc closes — not while typing, dragging or in a dialog
  useEffect(() => {
    if (!sel) return;
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || dragging)
        return;
      const t = e.target as HTMLElement;
      if (
        t.closest(
          "input, textarea, select, [contenteditable=true], [role=dialog], [role=alertdialog], [role=menu]",
        )
      ) {
        return;
      }
      if (e.key === "Escape") selection.close();
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        step(e.key === "ArrowDown" ? 1 : -1);
      } else return;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const canStep = {
    prev: !!selection.neighbour(-1),
    next: !!selection.neighbour(1),
  };
  const panel = selectedAct ? (
    <IntensityActPanel
      act={selectedAct}
      scenarioId={selectedAct.scenarioId}
      max={max}
      scenarios={scenarios.map((s) => ({ id: s.id, name: s.name }))}
      onClose={selection.close}
      onStep={step}
      canStep={canStep}
    />
  ) : selectedLevel !== null ? (
    <IntensityLevelPanel
      value={selectedLevel}
      max={max}
      title={steps.get(selectedLevel)?.title ?? null}
      description={steps.get(selectedLevel)?.description ?? null}
      maxName={maxName}
      acts={scenarios.flatMap((s) =>
        (layout[cellKey(s.id, selectedLevel)] ?? []).flatMap((id) => {
          const a = acts.get(id);
          return a ? [{ id: a.id, name: a.name, scenario: s.name }] : [];
        }),
      )}
      onOpenAct={selection.open}
      onClose={selection.close}
      onStep={step}
      canStep={canStep}
    />
  ) : selectedBoundary ? (
    <IntensityBoundaryPanel
      boundary={selectedBoundary}
      below={rows[rows.indexOf(selectedBoundary.value) - 1] ?? null}
      onClose={selection.close}
      onStep={step}
      canStep={canStep}
    />
  ) : null;
  const panelTitle =
    selectedAct?.name ??
    (selectedLevel !== null
      ? `Intensity ${formatIntensity(selectedLevel)}`
      : (selectedBoundary?.title ?? ""));

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
              of their level (0 to {formatIntensity(cap)} in half steps). A
              title is what a session offers to tick, its description shows on
              hover.
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
            <label className="text-muted-foreground flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={showBoundaries}
                onChange={(e) => setShowBoundaries(e.target.checked)}
                className="accent-primary h-3.5 w-3.5"
              />
              Boundaries
            </label>
            <IntensityMaxInput max={max} />
          </div>
        </div>

        <DndContext
          id="intensity-board"
          {...board.dnd}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        >
          <div className="flex items-start gap-4">
            <div className="bg-card/70 min-w-0 flex-1 overflow-x-auto rounded-2xl border border-white/20 shadow-sm backdrop-blur-md dark:border-white/10">
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
                  {shown.map((s, si) => {
                    const i = scenarios.indexOf(s);
                    return (
                      <div key={s.id} className={cn(col, si % 2 === 1 && ALT_COL)}>
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

                {rows.map((value, ri) => {
                  const isMax = value === max;
                  const lit = board.overLevel === value;
                  const boundary = boundaryAt.get(value) ?? null;
                  return (
                    <Fragment key={value}>
                      {ri > 0 && (
                        <IntensitySeam
                          value={value}
                          boundary={boundary}
                          open={
                            !!boundary &&
                            (showBoundaries || openBoundaries.has(boundary.id))
                          }
                          onToggle={() =>
                            boundary && toggleBoundary(boundary.id)
                          }
                          selected={
                            !!boundary && selectedBoundary?.id === boundary.id
                          }
                          onOpen={(id) =>
                            selection.select({ kind: "boundary", key: id })
                          }
                          headClassName={SCALE_COL}
                          stripColor={intensityColor(value, max)}
                        />
                      )}
                      <div
                        role="row"
                        className={cn(
                          "group/row flex border-b border-white/10 last:border-b-0",
                          lit && "bg-primary/10",
                        )}
                        // A breath of the lane's heat across the board — the strip's colour, barely there
                        style={lit ? undefined : { backgroundColor: laneTint(value, max) }}
                      >
                        {/* Sticky, so opaque: the lit tint sits on top of its card background */}
                        <div
                          className={cn(
                            SCALE_COL,
                            lit &&
                              "before:bg-primary/15 before:pointer-events-none before:absolute before:inset-0 before:content-['']",
                          )}
                        >
                          {/* The heat strip: this lane's colour running into the next one's — one unbroken ramp down the column */}
                          <span
                            aria-hidden="true"
                            className="absolute top-0 -bottom-px left-0 w-1.5"
                            style={{
                              background: `linear-gradient(to bottom, ${intensityColor(value, max)}, ${intensityColor(rows[ri + 1] ?? value, max)})`,
                            }}
                          />
                          <IntensityScaleCell
                            value={value}
                            title={steps.get(value)?.title ?? null}
                            description={steps.get(value)?.description ?? null}
                            showDescription={
                              showDescriptions || openSteps.has(value)
                            }
                            onToggleDescription={() => toggleStep(value)}
                            selected={selectedLevel === value}
                            onOpen={() =>
                              selection.select({
                                kind: "level",
                                key: String(value),
                              })
                            }
                            maxName={maxName}
                            max={max}
                            active={lit}
                          />
                        </div>
                        {shown.map((s, si) => (
                          <div key={s.id} className={cn(col, si % 2 === 1 && ALT_COL)}>
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
                                selectedId={selection.selectedId}
                                onOpen={selection.open}
                              />
                            )}
                          </div>
                        ))}
                        {!focused && (
                          <div className={cn(SCENARIO_COL, "w-52")} />
                        )}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>
            {/* Docked beside the board, in view while the board scrolls */}
            {wide && panel && (
              <div className="sticky top-4 max-h-[calc(100vh-2rem)] w-[22rem] shrink-0 overflow-y-auto">
                {panel}
              </div>
            )}
          </div>
          {/* Narrower: the panel slides over as a sheet */}
          {!wide && (
            <Sheet
              open={!!panel}
              onOpenChange={(open) => !open && selection.close()}
            >
              <SheetContent
                side="right"
                className="w-full max-w-sm overflow-y-auto p-0"
              >
                <SheetTitle className="sr-only">
                  {panelTitle || "Panel"}
                </SheetTitle>
                {panel && <div className="p-2">{panel}</div>}
              </SheetContent>
            </Sheet>
          )}
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
          Points added to an act&apos;s level — or taken off, for a circumstance
          that makes it easier. Set once per person in a session, every act there
          inherits them and can depart from them. The sum stays between 0 and{" "}
          {formatIntensity(cap)}; only {maxName} reaches {max}.
        </p>
        <IntensityExtrasPanel
          groups={groups}
          extras={extras}
          scaleMax={max}
          scenarios={scenarios.map((s) => ({ id: s.id, name: s.name }))}
        />
      </div>

      <div id="presets" className="scroll-mt-4 space-y-2">
        <h2 className="text-base font-semibold">Presets</h2>
        <p className="text-muted-foreground max-w-2xl text-sm">
          A bundle of acts and session extras for a kind of session you rate often. On a session, a preset ticks its
          acts for the selected models — nothing is taken away — and they stay <em>to review</em> until you confirm.
          The first nine are the keys 1–9 in the panel. A preset is a copy: editing it later changes no session.
        </p>
        <IntensityPresetsPanel
          presets={catalog.presets}
          scenarios={scenarios}
          groups={groups}
          extras={extras}
          max={max}
        />
      </div>
    </div>
  );
}
