"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Trash2 } from "lucide-react";
import { InlineEditable } from "@/components/shared/inline-editable";
import { IntensityExtrasPicker } from "@/components/intensity/intensity-extras-picker";
import {
  createIntensityPresetAction,
  deleteIntensityPresetAction,
  moveIntensityPresetAction,
  setIntensityPresetActsAction,
  setIntensityPresetExtrasAction,
  updateIntensityPresetAction,
} from "@/lib/actions/intensity-catalog-actions";
import {
  countsIn,
  formatIntensity,
  intensityColor,
  intensityTextColor,
  presetValue,
} from "@/lib/intensity";
import type { IntensityCatalog } from "@/lib/services/intensity-catalog-service";
import { cn } from "@/lib/utils";
import { IntensityAddInput } from "./intensity-add-input";
import { useCatalogCall } from "./use-catalog-call";

export type IntensityPresetsPanelProps = {
  presets: IntensityCatalog["presets"];
  scenarios: IntensityCatalog["scenarios"];
  groups: IntensityCatalog["groups"];
  extras: IntensityCatalog["extras"];
  max: number;
};

const card =
  "rounded-2xl border border-white/20 bg-card/70 shadow-sm backdrop-blur-md dark:border-white/10";

// Presets (2026-10-24): a bundle of acts and session extras for a kind of
// session, one scenario each (2026-10-25) — its acts are that scenario's, its
// extras those counting there. On a session the panel offers the presets of
// the cast's scenario as pills 1–9 in this order (the rest under "Other…"); a
// click ticks the acts for the selected models, who stay to review until
// confirmed. A copy — editing a preset changes no session.
export function IntensityPresetsPanel({
  presets,
  scenarios,
  groups,
  extras,
  max,
}: IntensityPresetsPanelProps) {
  const { call, run } = useCatalogCall();
  const [openId, setOpenId] = useState<string | null>(null);
  const extraName = new Map(extras.map((e) => [e.id, e.name]));
  const extraById = new Map(extras.map((e) => [e.id, e]));

  async function create(scenarioId: string, name: string) {
    let id: string | undefined;
    await call(async () => {
      const result = await createIntensityPresetAction(scenarioId, name);
      id = result.id;
      return result;
    });
    if (id) setOpenId(id);
  }

  function toggleAct(p: (typeof presets)[number], actId: string) {
    const next = p.actIds.includes(actId)
      ? p.actIds.filter((id) => id !== actId)
      : [...p.actIds, actId];
    run(() => setIntensityPresetActsAction(p.id, next));
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {scenarios
        .filter((sc) => sc.acts.length > 0)
        .map((sc) => {
          const own = presets.filter((p) => p.scenarioId === sc.id);
          const scExtras = extras.filter((e) => countsIn(e, sc.id));
          const scGroups = groups.filter((g) =>
            scExtras.some((e) => e.groupId === g.id),
          );
          return (
            <section
              key={sc.id}
              aria-label={`${sc.name} presets`}
              className="space-y-2"
            >
              <h3 className="text-sm font-semibold">
                {sc.name}{" "}
                <span className="text-muted-foreground font-normal">
                  · for a cast suggesting {sc.name}
                </span>
              </h3>
              {own.map((p, i) => {
                const open = openId === p.id;
                const level = new Map(sc.acts.map((a) => [a.id, a.level]));
                const levels = p.actIds.flatMap((id) => level.get(id) ?? []);
                const value = presetValue(
                  levels,
                  p.extraIds.flatMap((id) => extraById.get(id) ?? []),
                  sc.id,
                  max,
                );
                const summary = [
                  `${p.actIds.length} act${p.actIds.length === 1 ? "" : "s"}`,
                  ...p.extraIds.map((id) => extraName.get(id)).filter(Boolean),
                ].join(" · ");
                return (
                  <section
                    key={p.id}
                    aria-label={`Preset ${p.name}`}
                    className={card}
                  >
                    <header className="flex items-center gap-1.5 px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : p.id)}
                        aria-expanded={open}
                        aria-label={open ? `Close ${p.name}` : `Open ${p.name}`}
                        className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-0.5"
                      >
                        <ChevronRight
                          size={14}
                          className={cn(
                            "transition-transform duration-150",
                            open && "rotate-90",
                          )}
                          aria-hidden="true"
                        />
                      </button>
                      {i < 9 && (
                        <kbd
                          className="bg-muted text-muted-foreground rounded px-1 font-mono text-[10px] leading-4"
                          title={`Key ${i + 1} in the panel`}
                        >
                          {i + 1}
                        </kbd>
                      )}
                      <InlineEditable
                        value={p.name}
                        onSave={(name) =>
                          call(() =>
                            updateIntensityPresetAction(p.id, { name }),
                          )
                        }
                        className="min-w-0 px-1"
                      >
                        <h3 className="truncate text-sm font-semibold">
                          {p.name}
                        </h3>
                      </InlineEditable>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 text-[11px] font-semibold tabular-nums",
                          value === null && "bg-muted text-muted-foreground",
                        )}
                        style={
                          value === null
                            ? undefined
                            : {
                                backgroundColor: intensityColor(value, max),
                                color: intensityTextColor(value, max),
                              }
                        }
                        aria-label={
                          value === null
                            ? `${p.name}: no acts yet`
                            : `${p.name} gives ${formatIntensity(value)}`
                        }
                        title={
                          value === null
                            ? "No acts yet"
                            : `What it gives a model: the highest act (${formatIntensity(Math.max(...levels))}) with its extras`
                        }
                      >
                        {value === null ? "–" : formatIntensity(value)}
                      </span>
                      <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                        {summary}
                      </span>
                      {p.ticks > 0 && (
                        <span
                          className="text-muted-foreground shrink-0 text-[11px] tabular-nums"
                          title="Ticks made with this preset"
                        >
                          {p.ticks} ticks
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          run(() => moveIntensityPresetAction(p.id, -1))
                        }
                        disabled={i === 0}
                        aria-label={`Move ${p.name} up`}
                        className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1 disabled:opacity-30"
                      >
                        <ArrowUp size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          run(() => moveIntensityPresetAction(p.id, 1))
                        }
                        disabled={i === own.length - 1}
                        aria-label={`Move ${p.name} down`}
                        className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1 disabled:opacity-30"
                      >
                        <ArrowDown size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          run(() => deleteIntensityPresetAction(p.id))
                        }
                        aria-label={`Delete ${p.name}`}
                        title={
                          p.ticks > 0
                            ? "Delete — the ticks it made stay, they only forget the preset"
                            : "Delete"
                        }
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded p-1"
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </header>
                    {open && (
                      <div className="space-y-3 border-t border-white/10 px-3 pt-2 pb-3">
                        <InlineEditable
                          value={p.description ?? ""}
                          type="textarea"
                          placeholder="What kind of session — e.g. artistic nudes, outdoors, alone"
                          onSave={(description) =>
                            call(() =>
                              updateIntensityPresetAction(p.id, {
                                description,
                              }),
                            )
                          }
                        >
                          <p
                            className={cn(
                              "text-sm",
                              !p.description && "text-muted-foreground italic",
                            )}
                          >
                            {p.description || "Add a description…"}
                          </p>
                        </InlineEditable>
                        <div className="space-y-2">
                          <p className="text-muted-foreground text-[11px] font-medium">
                            Acts — click to take in or out
                          </p>
                          <div
                            className="flex flex-wrap gap-1"
                            role="group"
                            aria-label={`Acts in ${sc.name}`}
                          >
                            {sc.acts.map((a) => {
                              const on = p.actIds.includes(a.id);
                              return (
                                <button
                                  key={a.id}
                                  type="button"
                                  aria-pressed={on}
                                  onClick={() => toggleAct(p, a.id)}
                                  title={a.description ?? undefined}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors",
                                    on
                                      ? "border-primary bg-primary/15 font-medium"
                                      : "text-foreground/70 hover:bg-muted/60 border-white/15",
                                  )}
                                >
                                  <span
                                    className="rounded px-1 text-[10px] font-semibold tabular-nums"
                                    style={{
                                      backgroundColor: intensityColor(
                                        a.level,
                                        max,
                                      ),
                                      color: intensityTextColor(a.level, max),
                                    }}
                                  >
                                    {formatIntensity(a.level)}
                                  </span>
                                  {a.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-muted-foreground text-[11px] font-medium">
                            {`Session extras it sets — those counting in ${sc.name}; a grouped one replaces the person's choice`}
                          </p>
                          <IntensityExtrasPicker
                            extras={scExtras}
                            groups={scGroups}
                            selected={p.extraIds}
                            onChange={(extraIds) =>
                              run(() =>
                                setIntensityPresetExtrasAction(p.id, extraIds),
                              )
                            }
                            context={p.name}
                            max={max}
                          />
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}
              <IntensityAddInput
                placeholder={`New ${sc.name} preset — e.g. Artistic nude`}
                label={`Add a ${sc.name} preset`}
                onAdd={(name) => create(sc.id, name)}
                className="max-w-sm"
              />
            </section>
          );
        })}
    </div>
  );
}
