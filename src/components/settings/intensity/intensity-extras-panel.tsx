"use client";

import { Trash2, Zap } from "lucide-react";
import { InlineEditable } from "@/components/shared/inline-editable";
import {
  createIntensityExtraAction,
  createIntensityExtraGroupAction,
  deleteIntensityExtraGroupAction,
  renameIntensityExtraGroupAction,
  setIntensityGroupScenariosOffAction,
  updateIntensityExtraAction,
} from "@/lib/actions/intensity-catalog-actions";
import type { IntensityCatalog } from "@/lib/services/intensity-catalog-service";
import { IntensityAddInput } from "./intensity-add-input";
import { IntensityExtraRow } from "./intensity-extra-row";
import { IntensityScenarioScope, scopeHint } from "./intensity-scenario-scope";
import { useCatalogCall } from "./use-catalog-call";

export type IntensityExtrasPanelProps = {
  groups: IntensityCatalog["groups"];
  extras: IntensityCatalog["extras"];
  /** The top of the scale — what the Max extra sets */
  scaleMax: number;
  /** The scenarios — where a group or a free extra counts */
  scenarios: { id: string; name: string }[];
};

const card =
  "space-y-2 rounded-2xl border border-white/20 bg-card/70 p-3 shadow-sm backdrop-blur-md dark:border-white/10";

// The extras in two columns: Max (only renamed) and the extras that combine
// freely on the left; "New group" and one card per group (pick at most one)
// on the right.
export function IntensityExtrasPanel({
  groups,
  extras,
  scaleMax,
  scenarios,
}: IntensityExtrasPanelProps) {
  const { call, run } = useCatalogCall();
  const max = extras.find((e) => e.isMax);
  const plain = extras.filter((e) => !e.isMax);

  return (
    // Two columns: Max and the free extras on the left; a new group, then the groups, on the right
    <div className="grid items-start gap-3 sm:grid-cols-2">
      <div className="space-y-3">
        {max && (
          <section aria-label="Max extra" className={card}>
            <header className="flex items-center gap-1.5 px-1">
              <Zap size={14} className="text-amber-500" aria-hidden="true" />
              <InlineEditable
                value={max.name}
                onSave={(name) =>
                  call(() => updateIntensityExtraAction(max.id, { name }))
                }
                className="min-w-0 flex-1 px-1"
              >
                <h3 className="truncate text-sm font-semibold">{max.name}</h3>
              </InlineEditable>
              <span className="text-sm font-semibold tabular-nums">
                {scaleMax}
              </span>
            </header>
            <p className="text-muted-foreground px-1 text-xs">
              Sets the intensity to {scaleMax}, whatever the act and the other
              extras add up to. Only its name can change.
            </p>
          </section>
        )}
        <section aria-label="Extras without a group" className={card}>
          <header className="flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold">No group</h3>
            <span className="text-muted-foreground text-[11px]">
              any combination
            </span>
          </header>
          <ul className="space-y-1.5">
            {plain
              .filter((e) => !e.groupId)
              .map((e) => (
                <IntensityExtraRow
                  key={e.id}
                  extra={e}
                  groups={groups}
                  scenarios={scenarios}
                />
              ))}
          </ul>
          <IntensityAddInput
            placeholder="New extra…"
            label="Add an extra without a group"
            onAdd={(name) =>
              call(() => createIntensityExtraAction(name, 0, null))
            }
          />
        </section>
      </div>
      <div className="space-y-3">
        <section aria-label="New extra group" className={card}>
          <h3 className="px-1 text-sm font-semibold">New group</h3>
          <p className="text-muted-foreground px-1 text-xs">
            Extras in a group exclude each other — like private or public.
          </p>
          <IntensityAddInput
            placeholder="Group name…"
            label="Add an extra group"
            onAdd={(name) => call(() => createIntensityExtraGroupAction(name))}
          />
        </section>
        {groups.map((g) => {
          const members = plain.filter((e) => e.groupId === g.id);
          return (
            <section
              key={g.id}
              aria-label={`Extra group ${g.name}`}
              className={card}
            >
              <header className="flex items-center gap-1">
                <IntensityScenarioScope
                  of={`the group ${g.name}`}
                  off={g.offIn}
                  scenarios={scenarios}
                  onChange={(off) =>
                    run(() => setIntensityGroupScenariosOffAction(g.id, off))
                  }
                />
                <InlineEditable
                  value={g.name}
                  onSave={(name) =>
                    call(() => renameIntensityExtraGroupAction(g.id, name))
                  }
                  className="min-w-0 flex-1 px-1"
                >
                  <h3 className="truncate text-sm font-semibold">{g.name}</h3>
                </InlineEditable>
                <span className="text-muted-foreground text-[11px]">
                  pick one
                </span>
                <button
                  type="button"
                  onClick={() =>
                    run(() => deleteIntensityExtraGroupAction(g.id))
                  }
                  aria-label={`Delete group ${g.name}`}
                  title="Delete the group — its extras stay, ungrouped"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded p-1 transition-colors"
                >
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </header>
              {scopeHint(g.offIn, scenarios) && (
                <p className="text-primary -mt-1 px-1 text-[11px]">
                  {scopeHint(g.offIn, scenarios)}
                </p>
              )}
              {members.length === 0 && (
                <p className="text-muted-foreground px-1 text-xs italic">
                  No extras in this group yet.
                </p>
              )}
              <ul className="space-y-1.5">
                {members.map((e) => (
                  <IntensityExtraRow
                    key={e.id}
                    extra={e}
                    groups={groups}
                    scenarios={scenarios}
                  />
                ))}
              </ul>
              <IntensityAddInput
                placeholder="New extra…"
                label={`Add an extra to ${g.name}`}
                onAdd={(name) =>
                  call(() => createIntensityExtraAction(name, 0, g.id))
                }
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}
