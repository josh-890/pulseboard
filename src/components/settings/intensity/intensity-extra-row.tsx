"use client";

import { Trash2 } from "lucide-react";
import { InlineEditable } from "@/components/shared/inline-editable";
import { deleteIntensityExtraAction, updateIntensityExtraAction } from "@/lib/actions/intensity-catalog-actions";
import type { IntensityCatalog } from "@/lib/services/intensity-catalog-service";
import { IntensityStepInput } from "./intensity-step-input";
import { useCatalogCall } from "./use-catalog-call";

export type IntensityExtraRowProps = {
  extra: IntensityCatalog["extras"][number];
  groups: IntensityCatalog["groups"];
};

// One extra: its name, the points it adds and the group it belongs to; delete
// while unused.
export function IntensityExtraRow({ extra, groups }: IntensityExtraRowProps) {
  const { call, run } = useCatalogCall();
  const used = extra._count.contributions + extra._count.actOverrides;

  return (
    <li className="group/extra space-y-1 rounded-lg border border-white/10 bg-muted/20 px-2 py-1.5">
      <div className="flex items-start gap-1">
        <InlineEditable value={extra.name} onSave={(name) => call(() => updateIntensityExtraAction(extra.id, { name }))} className="min-w-0 flex-1 px-1 text-sm font-medium">
          {extra.name}
        </InlineEditable>
        <button
          type="button"
          onClick={() => run(() => deleteIntensityExtraAction(extra.id))}
          disabled={used > 0}
          aria-label={`Delete ${extra.name}`}
          title={used > 0 ? "Used in sessions — cannot delete" : "Delete"}
          className="shrink-0 rounded p-1 text-muted-foreground opacity-60 transition-colors hover:bg-destructive/10 hover:text-destructive group-hover/extra:opacity-100 focus-visible:opacity-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        >
          <Trash2 size={12} aria-hidden="true" />
        </button>
      </div>
      <div className="flex items-center gap-2 px-1">
        <IntensityStepInput
          key={extra.points}
          value={extra.points}
          prefix="+"
          label={`Points of ${extra.name}`}
          onCommit={(points) => call(() => updateIntensityExtraAction(extra.id, { points }))}
        />
        <select
          value={extra.groupId ?? ""}
          onChange={(e) => run(() => updateIntensityExtraAction(extra.id, { groupId: e.target.value || null }))}
          aria-label={`Group of ${extra.name}`}
          className="h-7 min-w-0 flex-1 rounded-md border border-white/15 bg-muted/30 px-1 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">No group</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        {used > 0 && <span className="shrink-0 text-[10px] text-muted-foreground" title="Times used in sessions">{used}×</span>}
      </div>
    </li>
  );
}
