"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { InlineEditable } from "@/components/shared/inline-editable";
import {
  createDisclosureSettingAction,
  deleteDisclosureSettingAction,
  moveDisclosureSettingAction,
  updateDisclosureSettingAction,
} from "@/lib/actions/disclosure-catalog-actions";
import type { DisclosureMatrix } from "@/lib/services/disclosure-catalog-service";
import { DisclosureAddInput } from "./disclosure-add-input";
import { useCatalogCall } from "./use-catalog-call";

export type DisclosureSettingsListProps = {
  settings: DisclosureMatrix["settings"];
};

// Where an entry happened, from the most private to the most public. Recorded
// on entries only — it does not shift a level yet (ADR-0035).
export function DisclosureSettingsList({ settings }: DisclosureSettingsListProps) {
  const { call, run } = useCatalogCall();
  return (
    <div className="max-w-md space-y-1.5">
      <ol className="space-y-1.5">
        {settings.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-muted/20 px-2 py-1">
            <span className="w-5 text-right text-xs tabular-nums text-muted-foreground" aria-hidden="true">{i + 1}</span>
            <InlineEditable value={s.name} onSave={(name) => call(() => updateDisclosureSettingAction(s.id, name))} className="min-w-0 flex-1 px-1 text-sm">
              {s.name}
            </InlineEditable>
            {s._count.entries > 0 && <span className="text-[10px] text-muted-foreground">{s._count.entries}</span>}
            <button type="button" onClick={() => run(() => moveDisclosureSettingAction(s.id, -1))} disabled={i === 0} aria-label={`Move ${s.name} up`} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:invisible">
              <ArrowUp size={12} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => run(() => moveDisclosureSettingAction(s.id, 1))} disabled={i === settings.length - 1} aria-label={`Move ${s.name} down`} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:invisible">
              <ArrowDown size={12} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => run(() => deleteDisclosureSettingAction(s.id))}
              disabled={s._count.entries > 0}
              aria-label={`Delete ${s.name}`}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
            >
              <Trash2 size={12} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      <DisclosureAddInput placeholder="Add a setting…" label="Add a setting" onAdd={(name) => call(() => createDisclosureSettingAction(name))} />
    </div>
  );
}
