"use client";

import { Pin, PinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComposerCatalog, ComposerStateRule } from "@/lib/composer";
import { ComposerTile, type TileState } from "./composer-tile";
import { ComposerMatrix } from "./composer-matrix";
import { ComposerRefinement } from "./composer-refinement";
import { pathStyle } from "./composer-path-style";

export type ComposerInspectorProps = {
  catalog: ComposerCatalog;
  activePathId: string;
  onPath: (pathId: string) => void;
  pinned: Set<string>;
  onPin: (pathId: string) => void;
  draft: string[];
  tileState: (tagId: string) => TileState;
  onToggle: (tagId: string, additive: boolean) => void;
  onCombination: (rule: ComposerStateRule, garmentId: string) => void;
  creating: string | null;
  /** photo's draft tag count per path — shown on the tabs */
  countByPath: Record<string, number>;
};

/**
 * The Composer's inspector (ADR-0042): four path tabs (keys 1–4) with a pin
 * each — a pinned path is carried over to the next photo — and the active path's
 * sections as tile surfaces. The refinement unfolds under every chosen base
 * posture, side by side for a duo.
 */
export function ComposerInspector({
  catalog,
  activePathId,
  onPath,
  pinned,
  onPin,
  draft,
  tileState,
  onToggle,
  onCombination,
  creating,
  countByPath,
}: ComposerInspectorProps) {
  const path = catalog.paths.find((p) => p.id === activePathId) ?? catalog.paths[0];
  const style = pathStyle(path.name);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="Composer paths" className="grid grid-cols-2 gap-1 border-b border-border/60 p-2 sm:grid-cols-4">
        {catalog.paths.map((p, i) => {
          const s = pathStyle(p.name);
          const active = p.id === path.id;
          const isPinned = pinned.has(p.id);
          return (
            <div
              key={p.id}
              className={cn(
                "flex min-w-0 items-center rounded-lg border transition-colors duration-150",
                active ? s.on : "border-transparent hover:bg-muted/50",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onPath(p.id)}
                title={`${p.name} — key ${i + 1}`}
                data-testid={`composer-path-${p.name}`}
                className="flex min-w-0 flex-1 items-center gap-1 rounded-l-lg py-1.5 pl-2 pr-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", s.dot)} aria-hidden />
                <span className={cn("truncate", active && s.text)}>{p.name}</span>
                {(countByPath[p.id] ?? 0) > 0 && (
                  <span className="ml-auto rounded-full bg-muted px-1 text-[9px] tabular-nums text-muted-foreground">{countByPath[p.id]}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onPin(p.id)}
                aria-pressed={isPinned}
                aria-label={isPinned ? `${p.name}: carried over to the next photo — click to stop` : `Carry ${p.name} over to the next photo`}
                title={isPinned ? "Carried over to the next photo" : "Not carried over"}
                data-testid={`composer-pin-${p.name}`}
                className="shrink-0 rounded-r-lg px-1 py-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {isPinned ? <Pin size={12} className={s.text} /> : <PinOff size={12} className="opacity-50" />}
              </button>
            </div>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3" data-testid="composer-path-surface">
        {path.sections.map((section) => (
          <section key={section.id} aria-label={section.name}>
            <h3 className="mb-1.5 text-xs font-semibold">{section.name}</h3>
            {section.kind === "REFINEMENT" ? (
              <ComposerRefinement catalog={catalog} path={path} draft={draft} tileState={tileState} style={style} onToggle={onToggle} />
            ) : section.kind === "MATRIX" ? (
              <ComposerMatrix
                catalog={catalog}
                section={section}
                draft={draft}
                tileState={tileState}
                style={style}
                onToggle={onToggle}
                onCombination={onCombination}
                creating={creating}
              />
            ) : (
              <div className="space-y-2">
                {section.groupIds.map((g) => (
                  <div key={g}>
                    {section.groupIds.length > 1 && (
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {catalog.groups[g]?.name}
                        {catalog.groups[g]?.isExclusive && <span className="ml-1 normal-case tracking-normal">· one</span>}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {(catalog.groups[g]?.tagIds ?? []).map((id) => (
                        <ComposerTile key={id} tag={catalog.tags[id]} state={tileState(id)} style={style} onToggle={onToggle} />
                      ))}
                    </div>
                  </div>
                ))}
                {path.sections[path.sections.indexOf(section) + 1]?.kind === "REFINEMENT" && (
                  <p className="text-[10px] text-muted-foreground">Click replaces · Shift-click adds a second (two people)</p>
                )}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );

}
