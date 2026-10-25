"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import { formatIntensity, intensityColor, intensityTextColor } from "@/lib/intensity";
import { cn } from "@/lib/utils";

/** The switch's last entry: every preset in one row, each naming its scenario */
export const ALL_PRESETS = "all";

type BarPreset = { id: string; name: string; description: string | null; actIds: string[]; value: number | null };

export type IntensityPresetBarProps = {
  /** The scenarios that have presets, in catalog order */
  scenarios: { id: string; name: string; suggested: boolean; presets: BarPreset[] }[];
  /** The scenario whose presets are pills, or ALL_PRESETS for every one */
  scenarioId: string | null;
  onScenario: (scenarioId: string) => void;
  /** Who it applies to, for the buttons' labels */
  target: string;
  max: number;
  onApply: (presetId: string) => void;
};

// The presets as pills, numbered as their digits (2026-10-24): a click — or the
// digit while the panel has focus — ticks the preset's acts for the selected
// models and lays its extras over theirs. Nothing is taken away. A preset is for
// one scenario (2026-10-25): the switch above the pills picks it, starting on
// the cast's suggestion — which can be wrong, so the others are one click away.
export function IntensityPresetBar({ scenarios, scenarioId, onScenario, target, max, onApply }: IntensityPresetBarProps) {
  if (scenarios.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        <Layers size={11} className="mr-1 inline" aria-hidden="true" />
        No presets yet —{" "}
        <Link href="/settings/catalogs/intensity#presets" className="underline underline-offset-2 hover:text-foreground">
          set one up
        </Link>{" "}
        for a kind of session you rate often.
      </p>
    );
  }
  const all = scenarioId === ALL_PRESETS && scenarios.length > 1;
  const current = all ? null : (scenarios.find((s) => s.id === scenarioId) ?? scenarios[0]!);
  const pills = current
    ? current.presets.map((p) => ({ ...p, scenario: null as string | null }))
    : scenarios.flatMap((s) => s.presets.map((p) => ({ ...p, scenario: s.name })));
  const radio = (on: boolean) =>
    cn(
      "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      on
        ? "border-primary bg-primary/15 font-medium text-foreground"
        : "border-white/15 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
    );
  const hint = (p: BarPreset) =>
    [p.description, `${p.actIds.length} act${p.actIds.length === 1 ? "" : "s"} — adds what is missing, takes nothing away`].filter(Boolean).join("\n");
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Presets for scenario">
        <span className="mr-0.5 text-[11px] font-medium text-muted-foreground">Presets for</span>
        {scenarios.map((s) => {
          const on = s.id === current?.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onScenario(s.id)}
              title={s.suggested ? "Suggested from the cast" : undefined}
              className={radio(on)}
            >
              {s.name}
              {s.suggested && (
                <span className="size-1.5 rounded-full bg-primary" aria-label="suggested" />
              )}
            </button>
          );
        })}
        {scenarios.length > 1 && (
          <button
            type="button"
            role="radio"
            aria-checked={all}
            onClick={() => onScenario(ALL_PRESETS)}
            title="Every preset, whatever the cast"
            className={radio(all)}
          >
            All
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Presets">
        {pills.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onApply(p.id)}
            aria-label={`Apply ${p.name}${p.scenario ? ` (${p.scenario})` : ""} to ${target}`}
            title={hint(p)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-white/15 px-1.5 py-0.5 text-xs transition-colors",
              "hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            )}
          >
            {i < 9 && (
              <kbd className="rounded bg-muted px-1 font-mono text-[10px] leading-4 text-muted-foreground" aria-hidden="true">
                {i + 1}
              </kbd>
            )}
            {p.name}
            {p.scenario && <span className="text-[10px] text-muted-foreground">{p.scenario}</span>}
            {p.value !== null && (
              <span
                className="rounded px-1 text-[10px] font-semibold tabular-nums"
                style={{ backgroundColor: intensityColor(p.value, max), color: intensityTextColor(p.value, max) }}
                aria-hidden="true"
              >
                {formatIntensity(p.value)}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
