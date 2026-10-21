"use client";

import { Trash2, Zap } from "lucide-react";
import { InlineEditable } from "@/components/shared/inline-editable";
import {
  createIntensityExtraAction,
  createIntensityExtraGroupAction,
  deleteIntensityExtraGroupAction,
  renameIntensityExtraGroupAction,
  updateIntensityExtraAction,
} from "@/lib/actions/intensity-catalog-actions";
import type { IntensityCatalog } from "@/lib/services/intensity-catalog-service";
import { IntensityAddInput } from "./intensity-add-input";
import { IntensityExtraRow } from "./intensity-extra-row";
import { useCatalogCall } from "./use-catalog-call";

export type IntensityExtrasPanelProps = {
  groups: IntensityCatalog["groups"];
  extras: IntensityCatalog["extras"];
};

const card = "space-y-2 rounded-2xl border border-white/20 bg-card/70 p-3 shadow-sm backdrop-blur-md dark:border-white/10";

// The extras: one card per group (pick at most one), one for the extras that
// combine freely, and Max — which can only be renamed.
export function IntensityExtrasPanel({ groups, extras }: IntensityExtrasPanelProps) {
  const { call, run } = useCatalogCall();
  const max = extras.find((e) => e.isMax);
  const plain = extras.filter((e) => !e.isMax);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((g) => {
        const members = plain.filter((e) => e.groupId === g.id);
        return (
          <section key={g.id} aria-label={`Extra group ${g.name}`} className={card}>
            <header className="flex items-center gap-1">
              <InlineEditable value={g.name} onSave={(name) => call(() => renameIntensityExtraGroupAction(g.id, name))} className="min-w-0 flex-1 px-1">
                <h3 className="truncate text-sm font-semibold">{g.name}</h3>
              </InlineEditable>
              <span className="text-[11px] text-muted-foreground">pick one</span>
              <button
                type="button"
                onClick={() => run(() => deleteIntensityExtraGroupAction(g.id))}
                aria-label={`Delete group ${g.name}`}
                title="Delete the group — its extras stay, ungrouped"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 size={12} aria-hidden="true" />
              </button>
            </header>
            {members.length === 0 && <p className="px-1 text-xs italic text-muted-foreground">No extras in this group yet.</p>}
            <ul className="space-y-1.5">
              {members.map((e) => <IntensityExtraRow key={e.id} extra={e} groups={groups} />)}
            </ul>
            <IntensityAddInput placeholder="New extra…" label={`Add an extra to ${g.name}`} onAdd={(name) => call(() => createIntensityExtraAction(name, 0, g.id))} />
          </section>
        );
      })}

      <section aria-label="Extras without a group" className={card}>
        <header className="flex items-center justify-between px-1">
          <h3 className="text-sm font-semibold">No group</h3>
          <span className="text-[11px] text-muted-foreground">any combination</span>
        </header>
        <ul className="space-y-1.5">
          {plain.filter((e) => !e.groupId).map((e) => <IntensityExtraRow key={e.id} extra={e} groups={groups} />)}
        </ul>
        <IntensityAddInput placeholder="New extra…" label="Add an extra without a group" onAdd={(name) => call(() => createIntensityExtraAction(name, 0, null))} />
      </section>

      <div className="space-y-3">
        {max && (
          <section aria-label="Max extra" className={card}>
            <header className="flex items-center gap-1.5 px-1">
              <Zap size={14} className="text-amber-500" aria-hidden="true" />
              <InlineEditable value={max.name} onSave={(name) => call(() => updateIntensityExtraAction(max.id, { name }))} className="min-w-0 flex-1 px-1">
                <h3 className="truncate text-sm font-semibold">{max.name}</h3>
              </InlineEditable>
              <span className="text-sm font-semibold tabular-nums">10</span>
            </header>
            <p className="px-1 text-xs text-muted-foreground">
              Sets the intensity to 10, whatever the act and the other extras add up to. Only its name can change.
            </p>
          </section>
        )}
        <section aria-label="New extra group" className={card}>
          <h3 className="px-1 text-sm font-semibold">New group</h3>
          <p className="px-1 text-xs text-muted-foreground">Extras in a group exclude each other — like private or public.</p>
          <IntensityAddInput placeholder="Group name…" label="Add an extra group" onAdd={(name) => call(() => createIntensityExtraGroupAction(name))} />
        </section>
      </div>
    </div>
  );
}
