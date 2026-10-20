"use client";

import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { InlineEditable } from "@/components/shared/inline-editable";
import {
  createDisclosureLevelAction,
  deleteDisclosureSituationAction,
  moveDisclosureSituationAction,
  updateDisclosureSituationAction,
} from "@/lib/actions/disclosure-catalog-actions";
import type { DisclosureMatrix } from "@/lib/services/disclosure-catalog-service";
import { DisclosureAddInput } from "./disclosure-add-input";
import { DisclosureLevelRow } from "./disclosure-level-row";
import { useCatalogCall } from "./use-catalog-call";

export type DisclosureSituationColumnProps = {
  situation: DisclosureMatrix["situations"][number];
  isFirst: boolean;
  isLast: boolean;
};

// One column of the matrix: the situation's name and score weight, its ladder
// from the first step (top) to the highest (bottom), and a field to add a step.
export function DisclosureSituationColumn({ situation, isFirst, isLast }: DisclosureSituationColumnProps) {
  const { call, run } = useCatalogCall();
  const used = situation.levels.reduce((n, l) => n + l._count.entries, 0);

  return (
    <section
      aria-label={`Situation ${situation.name}`}
      className="flex w-64 shrink-0 flex-col gap-2 rounded-2xl border border-white/20 bg-card/70 p-3 shadow-sm backdrop-blur-md dark:border-white/10"
    >
      <header className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => run(() => moveDisclosureSituationAction(situation.id, -1))}
          disabled={isFirst}
          aria-label={`Move ${situation.name} left`}
          className="rounded p-1 text-muted-foreground hover:text-foreground disabled:invisible"
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <InlineEditable
          value={situation.name}
          onSave={(name) => call(() => updateDisclosureSituationAction(situation.id, { name }))}
          className="min-w-0 flex-1 px-1 text-center"
        >
          <h3 className="truncate text-sm font-semibold">{situation.name}</h3>
        </InlineEditable>
        <button
          type="button"
          onClick={() => run(() => moveDisclosureSituationAction(situation.id, 1))}
          disabled={isLast}
          aria-label={`Move ${situation.name} right`}
          className="rounded p-1 text-muted-foreground hover:text-foreground disabled:invisible"
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </header>

      <label className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        Weight in the score
        <input
          type="number"
          min={0}
          step={0.5}
          defaultValue={situation.weight}
          aria-label={`Weight of ${situation.name}`}
          onBlur={(e) => {
            const weight = Number(e.target.value);
            if (weight !== situation.weight) run(() => updateDisclosureSituationAction(situation.id, { weight }));
          }}
          className="h-7 w-16 rounded-md border border-white/15 bg-muted/30 px-1.5 text-right text-sm tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      {situation.levels.length === 0 ? (
        <p className="px-1 py-2 text-xs italic text-muted-foreground">No steps yet — add the first, lowest one.</p>
      ) : (
        <ol className="space-y-1.5">
          {situation.levels.map((level, i) => (
            <DisclosureLevelRow key={level.id} level={level} isFirst={i === 0} isLast={i === situation.levels.length - 1} />
          ))}
        </ol>
      )}

      <DisclosureAddInput
        placeholder="Next step…"
        label={`Add a step to ${situation.name}`}
        onAdd={(name) => call(() => createDisclosureLevelAction(situation.id, name))}
      />

      <button
        type="button"
        onClick={() => run(() => deleteDisclosureSituationAction(situation.id))}
        disabled={used > 0}
        title={used > 0 ? "Its steps are in use — cannot delete" : undefined}
        className="mt-auto inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
      >
        <Trash2 size={12} aria-hidden="true" /> Delete situation
      </button>
    </section>
  );
}
