"use client";

import { createDisclosureSituationAction } from "@/lib/actions/disclosure-catalog-actions";
import type { DisclosureMatrix } from "@/lib/services/disclosure-catalog-service";
import { DisclosureAddInput } from "./disclosure-add-input";
import { DisclosureSettingsList } from "./disclosure-settings-list";
import { DisclosureSituationColumn } from "./disclosure-situation-column";
import { useCatalogCall } from "./use-catalog-call";

export type DisclosureMatrixEditorProps = {
  matrix: DisclosureMatrix;
};

// Settings → Catalogs → Disclosure (ADR-0035): the situations left to right,
// each with its own ladder top (first step) to bottom (highest), then the
// settings list.
export function DisclosureMatrixEditor({ matrix }: DisclosureMatrixEditorProps) {
  const { call } = useCatalogCall();
  const { situations, settings } = matrix;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-base font-semibold">Matrix</h2>
        <p className="text-sm text-muted-foreground">
          Situations from left to right, each with its own ladder — the first step at the top, the highest at the
          bottom. The weight sets how much a situation counts in the disclosure score.
        </p>
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
          {situations.map((s, i) => (
            <DisclosureSituationColumn key={s.id} situation={s} isFirst={i === 0} isLast={i === situations.length - 1} />
          ))}
          <div className="flex w-56 shrink-0 flex-col justify-start rounded-2xl border border-dashed border-white/20 p-3">
            <DisclosureAddInput
              placeholder="New situation…"
              label="Add a situation"
              onAdd={(name) => call(() => createDisclosureSituationAction(name))}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-base font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Where it happened, from the most private to the most public. Recorded on every entry; it does not change a
          level yet.
        </p>
        <DisclosureSettingsList settings={settings} />
      </div>
    </div>
  );
}
