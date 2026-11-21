"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  combinationName,
  findCombination,
  matrixGarments,
  statesForGarment,
  type ComposerCatalog,
  type ComposerSection,
  type ComposerStateRule,
} from "@/lib/composer";
import { ComposerTile, type TileState } from "./composer-tile";
import type { PathStyle } from "./composer-path-style";

export type ComposerMatrixProps = {
  catalog: ComposerCatalog;
  section: ComposerSection;
  draft: string[];
  tileState: (tagId: string) => TileState;
  style: PathStyle;
  onToggle: (tagId: string, additive: boolean) => void;
  /** Toggle a state on a garment — the combination is created first if needed */
  onCombination: (rule: ComposerStateRule, garmentId: string) => void;
  /** `${stateGroupId}:${garmentId}` while its combination is being created */
  creating: string | null;
};

/**
 * The state matrix (ADR-0042): one row per garment held (or implied by a
 * combination), with the states that fit it. A chip names the combination it
 * stands for (`torn-bra`); the first tap creates that tag if the catalogue has
 * none. Below, the generic states (`torn-clothes`) and the plain groups of the
 * section (Position, Fit) as tiles.
 */
export function ComposerMatrix({ catalog, section, draft, tileState, style, onToggle, onCombination, creating }: ComposerMatrixProps) {
  const garments = matrixGarments(catalog, draft);
  const ruleGroups = new Set(catalog.stateRules.map((r) => r.stateGroupId));
  const plainGroups = section.groupIds.filter((g) => !ruleGroups.has(g));
  const rulesHere = catalog.stateRules.filter((r) => section.groupIds.includes(r.stateGroupId));

  return (
    <div className="space-y-3">
      {garments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          Pick a garment under <span className="font-medium">Garments</span> — its states (torn, wet, pulled …) show here.
        </p>
      ) : (
        <ul className="space-y-1.5" data-testid="composer-matrix">
          {garments.map((gid) => {
            const garment = catalog.tags[gid];
            return (
              <li key={gid} className="flex flex-wrap items-center gap-1.5">
                <span className="w-24 shrink-0 truncate text-xs font-medium" title={garment.name}>
                  {garment.name} ▸
                </span>
                {statesForGarment(catalog, gid)
                  .filter((r) => section.groupIds.includes(r.stateGroupId))
                  .map((rule) => {
                    const combo = findCombination(catalog, rule, gid);
                    const on = combo ? draft.includes(combo.id) : false;
                    const busy = creating === `${rule.stateGroupId}:${gid}`;
                    const label = combinationName(rule, garment);
                    return (
                      <button
                        key={rule.stateGroupId}
                        type="button"
                        onClick={() => onCombination(rule, gid)}
                        disabled={busy}
                        aria-pressed={on}
                        data-testid="composer-matrix-chip"
                        data-tag={label}
                        title={combo ? label : `${label} — created on first use`}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors duration-150",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          on ? cn(style.on, style.text, "font-medium") : "border-border/50 bg-card/60 text-muted-foreground hover:text-foreground",
                          !combo && !on && "border-dashed",
                        )}
                      >
                        {busy && <Loader2 size={10} className="animate-spin" />}
                        {label}
                      </button>
                    );
                  })}
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Any clothes</p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {rulesHere.map((r) => {
            const t = catalog.tags[r.genericTagId];
            return t ? <ComposerTile key={t.id} tag={t} state={tileState(t.id)} style={style} onToggle={onToggle} /> : null;
          })}
        </div>
      </div>

      {plainGroups.map((g) => (
        <div key={g}>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{catalog.groups[g]?.name}</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {(catalog.groups[g]?.tagIds ?? []).map((id) => (
              <ComposerTile key={id} tag={catalog.tags[id]} state={tileState(id)} style={style} onToggle={onToggle} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
