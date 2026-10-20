"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { InlineEditable } from "@/components/shared/inline-editable";
import {
  deleteDisclosureLevelAction,
  moveDisclosureLevelAction,
  updateDisclosureLevelAction,
} from "@/lib/actions/disclosure-catalog-actions";
import { useCatalogCall } from "./use-catalog-call";

export type DisclosureLevelRowProps = {
  level: { id: string; name: string; description: string | null; rank: number; _count: { entries: number } };
  isFirst: boolean;
  isLast: boolean;
};

// One step of a situation's ladder: number, name, description; move up/down,
// delete while unused.
export function DisclosureLevelRow({ level, isFirst, isLast }: DisclosureLevelRowProps) {
  const { call, run } = useCatalogCall();
  const used = level._count.entries;

  return (
    <li className="group/level flex items-start gap-2 rounded-lg border border-white/10 bg-muted/20 px-2 py-1.5">
      <span className="mt-1 w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground" aria-hidden="true">
        {level.rank + 1}
      </span>
      <div className="min-w-0 flex-1">
        <InlineEditable value={level.name} onSave={(name) => call(() => updateDisclosureLevelAction(level.id, { name }))} className="px-1 text-sm font-medium">
          <span aria-label={`Level ${level.rank + 1}: ${level.name}`}>{level.name}</span>
        </InlineEditable>
        <InlineEditable
          value={level.description ?? ""}
          onSave={(description) => call(() => updateDisclosureLevelAction(level.id, { description }))}
          placeholder="What it means…"
          className="px-1 text-xs text-muted-foreground"
        >
          {level.description || <span className="italic opacity-60">Add a description</span>}
        </InlineEditable>
        {used > 0 && <p className="px-1 text-[10px] text-muted-foreground/70">{used} {used === 1 ? "entry" : "entries"}</p>}
      </div>
      <div className="flex shrink-0 flex-col opacity-60 transition-opacity group-hover/level:opacity-100 group-focus-within/level:opacity-100">
        <button
          type="button"
          onClick={() => run(() => moveDisclosureLevelAction(level.id, -1))}
          disabled={isFirst}
          aria-label={`Move ${level.name} lower`}
          title="Lower step"
          className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:invisible"
        >
          <ArrowUp size={12} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => run(() => moveDisclosureLevelAction(level.id, 1))}
          disabled={isLast}
          aria-label={`Move ${level.name} higher`}
          title="Higher step"
          className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:invisible"
        >
          <ArrowDown size={12} aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => run(() => deleteDisclosureLevelAction(level.id))}
        disabled={used > 0}
        aria-label={`Delete ${level.name}`}
        title={used > 0 ? "In use — cannot delete" : "Delete"}
        className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
      >
        <Trash2 size={12} aria-hidden="true" />
      </button>
    </li>
  );
}
