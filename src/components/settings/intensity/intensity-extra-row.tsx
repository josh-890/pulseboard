"use client";

import { FolderInput, Trash2, Unlink } from "lucide-react";
import { InlineEditable } from "@/components/shared/inline-editable";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteIntensityExtraAction,
  setIntensityExtraScenariosOffAction,
  updateIntensityExtraAction,
} from "@/lib/actions/intensity-catalog-actions";
import type { IntensityCatalog } from "@/lib/services/intensity-catalog-service";
import { IntensityStepInput } from "./intensity-step-input";
import { useCatalogCall } from "./use-catalog-call";
import { IntensityScenarioScope, scopeHint } from "./intensity-scenario-scope";

export type IntensityExtraRowProps = {
  extra: IntensityCatalog["extras"][number];
  groups: IntensityCatalog["groups"];
  /** Where a free extra counts — chosen here; a grouped one follows its group */
  scenarios: { id: string; name: string }[];
};

const ICON =
  "text-muted-foreground shrink-0 rounded p-1 opacity-60 transition-colors group-hover/extra:opacity-100 focus-visible:opacity-100";

// One extra in one slim line: first a small icon — in a group "take it out"
// (it falls back to No group), without one "put into a group…" — then its
// name, the points it adds, how often it is used, and delete while unused. The card it
// sits in already says which group it is in (2026-10-23).
export function IntensityExtraRow({
  extra,
  groups,
  scenarios,
}: IntensityExtraRowProps) {
  const { call, run } = useCatalogCall();
  const used = extra._count.contributions + extra._count.actOverrides;
  const setGroup = (groupId: string | null) =>
    run(() => updateIntensityExtraAction(extra.id, { groupId }));

  return (
    <li className="group/extra bg-muted/20 flex items-center gap-1 rounded-lg border border-white/10 px-1.5 py-0.5">
      {/* The group icon first, apart from delete — no slip between the two */}
      {extra.groupId ? (
        <button
          type="button"
          onClick={() => setGroup(null)}
          aria-label={`Take ${extra.name} out of its group`}
          title="Take it out of the group — it moves to No group"
          className={`${ICON} hover:text-foreground hover:bg-muted/50`}
        >
          <Unlink size={12} aria-hidden="true" />
        </button>
      ) : (
        groups.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Put ${extra.name} into a group`}
                title="Put it into a group"
                className={`${ICON} hover:text-foreground hover:bg-muted/50`}
              >
                <FolderInput size={12} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">
                Into the group
              </DropdownMenuLabel>
              {groups.map((g) => (
                <DropdownMenuItem key={g.id} onSelect={() => setGroup(g.id)}>
                  {g.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      )}
      {!extra.groupId && (
        <IntensityScenarioScope
          of={extra.name}
          off={extra.offIn}
          scenarios={scenarios}
          onChange={(off) =>
            run(() => setIntensityExtraScenariosOffAction(extra.id, off))
          }
        />
      )}
      <div className="min-w-0 flex-1">
        <InlineEditable
          value={extra.name}
          onSave={(name) =>
            call(() => updateIntensityExtraAction(extra.id, { name }))
          }
          className="px-1 text-sm font-medium"
        >
          {extra.name}
        </InlineEditable>
        {!extra.groupId && scopeHint(extra.offIn, scenarios) && (
          <p className="text-primary px-1 text-[11px] leading-3">
            {scopeHint(extra.offIn, scenarios)}
          </p>
        )}
      </div>
      <IntensityStepInput
        key={extra.points}
        value={extra.points}
        prefix={extra.points < 0 ? undefined : "+"}
        allowNegative
        label={`Points of ${extra.name}`}
        onCommit={(points) =>
          call(() => updateIntensityExtraAction(extra.id, { points }))
        }
      />
      <span
        className="text-muted-foreground w-6 shrink-0 text-right text-[10px] tabular-nums"
        title="Times used in sessions"
      >
        {used > 0 ? `${used}×` : ""}
      </span>
      <button
        type="button"
        onClick={() => run(() => deleteIntensityExtraAction(extra.id))}
        disabled={used > 0}
        aria-label={`Delete ${extra.name}`}
        title={used > 0 ? "Used in sessions — cannot delete" : "Delete"}
        className={`${ICON} hover:bg-destructive/10 hover:text-destructive disabled:hover:text-muted-foreground disabled:opacity-30 disabled:hover:bg-transparent`}
      >
        <Trash2 size={12} aria-hidden="true" />
      </button>
    </li>
  );
}
