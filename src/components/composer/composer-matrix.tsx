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
import { ComposerTile, wantsVisualTiles, type TileState } from "./composer-tile";
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
  countOf?: (tagId: string) => { n: number; of: number } | undefined;
  tileAspect?: string;
};

/**
 * The state matrix (ADR-0042): one row per garment held (or implied by a
 * combination), with the states that fit it. A chip names the combination it
 * stands for (`torn-bra`); the first tap creates that tag if the catalogue has
 * none. Below, the generic states (`torn-clothes`) and the plain groups of the
 * section (Position, Fit) as tiles.
 */
export function ComposerMatrix({ catalog, section, draft, tileState, style, onToggle, onCombination, creating, countOf, tileAspect }: ComposerMatrixProps) {
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
                    const state = combo ? tileState(combo.id) : "off";
                    const on = state === "on" || state === "add" || state === "proposed";
                    const busy = creating === `${rule.stateGroupId}:${gid}`;
                    const label = combinationName(rule, garment);
                    return (
                      <button
                        key={rule.stateGroupId}
                        type="button"
                        onClick={() => onCombination(rule, gid)}
                        disabled={busy}
                        aria-pressed={on}
                        data-state={state}
                        data-testid="composer-matrix-chip"
                        data-tag={label}
                        title={combo ? label : `${label} — created on first use`}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors duration-150",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          state === "add"
                            ? "border-emerald-500/60 bg-emerald-500/15 font-medium text-emerald-700 dark:text-emerald-300"
                            : state === "remove"
                              ? "border-rose-500/60 bg-rose-500/10 text-rose-700 line-through dark:text-rose-300"
                              : on
                                ? cn(style.on, style.text, "font-medium")
                                : state === "partial"
                                  ? "border-border bg-muted/40 text-foreground"
                                  : "border-border/50 bg-card/60 text-muted-foreground hover:text-foreground",
                          !combo && "border-dashed",
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
        <div className={cn("grid gap-1.5", wantsVisualTiles(rulesHere.map((r) => catalog.tags[r.genericTagId]).filter(Boolean)) ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3")}>
          {rulesHere.map((r) => {
            const t = catalog.tags[r.genericTagId];
            return t ? (
              <ComposerTile
                key={t.id}
                tag={t}
                state={tileState(t.id)}
                style={style}
                onToggle={onToggle}
                count={countOf?.(t.id)}
                visual={wantsVisualTiles(rulesHere.map((x) => catalog.tags[x.genericTagId]).filter(Boolean))}
                tileAspect={tileAspect}
              />
            ) : null;
          })}
        </div>
      </div>

      {plainGroups.map((g) => (
        <div key={g}>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{catalog.groups[g]?.name}</p>
          <div className={cn("grid gap-1.5", wantsVisualTiles((catalog.groups[g]?.tagIds ?? []).map((id) => catalog.tags[id])) ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3")}>
            {(catalog.groups[g]?.tagIds ?? []).map((id) => (
              <ComposerTile
                key={id}
                tag={catalog.tags[id]}
                state={tileState(id)}
                style={style}
                onToggle={onToggle}
                count={countOf?.(id)}
                visual={wantsVisualTiles((catalog.groups[g]?.tagIds ?? []).map((x) => catalog.tags[x]))}
                tileAspect={tileAspect}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
