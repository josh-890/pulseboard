"use client";

import { Zap } from "lucide-react";
import { formatPoints } from "@/lib/intensity";
import { cn } from "@/lib/utils";

export type PickerExtra = {
  id: string;
  name: string;
  points: number;
  groupId: string | null;
  isMax: boolean;
  /** Scenarios it does not count in (2026-10-23) */
  offIn?: string[];
};
export type PickerGroup = { id: string; name: string };

export type IntensityExtrasPickerProps = {
  extras: PickerExtra[];
  groups: PickerGroup[];
  selected: string[];
  onChange: (extraIds: string[]) => void;
  /** Extras the choice departs from (an act's inherited ones) — marked where they differ */
  inherited?: string[];
  /** Several people at once: extras only some of them have (`selected` is what all have) — dashed; a click sets it for all */
  mixed?: string[];
  disabled?: boolean;
  /** For aria-labels, e.g. "Anna (AB-001)" or "Topless" */
  context: string;
  /** The top of the tenant's scale — what the Max extra sets */
  max: number;
};

// The extras as controls: each group a single choice (with "none"), the rest
// toggles, Max set apart. Used for a person's session extras and an act's own.
export function IntensityExtrasPicker({ extras, groups, selected, onChange, inherited, mixed, disabled, context, max }: IntensityExtrasPickerProps) {
  const on = new Set(selected);
  const some = new Set(mixed ?? []);
  const from = inherited ? new Set(inherited) : null;
  const departs = (id: string) => from !== null && from.has(id) !== on.has(id);

  function choose(groupId: string, extraId: string | null) {
    const rest = selected.filter((id) => extras.find((e) => e.id === id)?.groupId !== groupId);
    onChange(extraId ? [...rest, extraId] : rest);
  }
  function toggle(extraId: string) {
    onChange(on.has(extraId) ? selected.filter((id) => id !== extraId) : [...selected, extraId]);
  }

  const chip = (active: boolean, differs: boolean, partly = false) =>
    cn(
      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      partly && !active && "bg-primary/10 text-foreground outline-1 outline-dashed outline-primary/60",
      differs && "ring-1 ring-amber-500/70",
    );
  const partlyTitle = (e: PickerExtra) => (some.has(e.id) ? `${e.name}: only some of them — click to set it for all` : undefined);
  const pts = (e: PickerExtra) => <span className="tabular-nums opacity-75">{formatPoints(e.points)}</span>;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {groups.map((g) => {
        const members = extras.filter((e) => e.groupId === g.id && !e.isMax);
        if (members.length === 0) return null;
        const chosen = members.find((e) => on.has(e.id))?.id ?? null;
        const anyPartly = members.some((e) => some.has(e.id));
        return (
          <div key={g.id} role="radiogroup" aria-label={`${g.name} for ${context}`} className="flex flex-wrap items-center gap-0.5 rounded-lg border border-white/15 bg-background/40 p-0.5">
            <span className="px-1.5 text-[11px] font-medium text-muted-foreground">{g.name}</span>
            <button
              type="button"
              role="radio"
              aria-checked={chosen === null && !anyPartly}
              disabled={disabled}
              onClick={() => choose(g.id, null)}
              className={chip(chosen === null && !anyPartly, members.some((e) => departs(e.id)) && chosen === null)}
            >
              —
            </button>
            {members.map((e) => (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={chosen === e.id}
                disabled={disabled}
                onClick={() => choose(g.id, e.id)}
                title={partlyTitle(e)}
                className={chip(chosen === e.id, departs(e.id) && chosen === e.id, some.has(e.id))}
              >
                {e.name} {pts(e)}
              </button>
            ))}
          </div>
        );
      })}
      {extras
        .filter((e) => !e.groupId && !e.isMax)
        .map((e) => (
          <button
            key={e.id}
            type="button"
            aria-pressed={on.has(e.id) ? true : some.has(e.id) ? "mixed" : false}
            aria-label={`${e.name} for ${context}`}
            title={partlyTitle(e)}
            disabled={disabled}
            onClick={() => toggle(e.id)}
            className={cn(chip(on.has(e.id), departs(e.id), some.has(e.id)), "border border-white/15")}
          >
            {e.name} {pts(e)}
          </button>
        ))}
      {extras
        .filter((e) => e.isMax)
        .map((e) => (
          <button
            key={e.id}
            type="button"
            aria-pressed={on.has(e.id) ? true : some.has(e.id) ? "mixed" : false}
            aria-label={`${e.name} for ${context}`}
            title={partlyTitle(e)}
            disabled={disabled}
            onClick={() => toggle(e.id)}
            className={cn(
              chip(false, departs(e.id), some.has(e.id)),
              "border border-amber-500/40",
              on.has(e.id) && "bg-amber-500 text-white hover:bg-amber-500/90 hover:text-white",
            )}
          >
            <Zap size={11} aria-hidden="true" /> {e.name} <span className="opacity-75">{max}</span>
          </button>
        ))}
    </div>
  );
}
