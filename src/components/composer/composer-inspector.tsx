"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pin, PinOff, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  contextsOf,
  facetCollapsed,
  facetView,
  leadSection,
  nextFocusFacet,
  relevanceOf,
  suggestCombinations,
  tileAspectOfGroup,
  type ComposerCatalog,
  type ComposerPath,
  type ComposerStateRule,
} from "@/lib/composer";
import type { TileState } from "./composer-tile";
import { ComposerMatrix } from "./composer-matrix";
import { ComposerFacet } from "./composer-facet";
import { ComposerShotRow } from "./composer-shot-row";
import { pathStyle } from "./composer-path-style";

export type ComposerInspectorProps = {
  catalog: ComposerCatalog;
  /** The paths offered under the photo's contexts, in key order */
  paths: ComposerPath[];
  activePathId: string;
  onPath: (pathId: string) => void;
  pinned: Set<string>;
  onPin: (pathId: string) => void;
  draft: string[];
  tileState: (tagId: string) => TileState;
  onToggle: (tagId: string, additive: boolean) => void;
  onCombination: (rule: ComposerStateRule, garmentId: string) => void;
  /** Take a suggested named form ("= seiza?") — null on a selection or brush */
  onTakeCombination: ((comboId: string) => void) | null;
  creating: string | null;
  /** photo's draft tag count per path — shown on the tabs */
  countByPath: Record<string, number>;
  /** On a selection: how many selected photos carry a tag */
  countOf?: (tagId: string) => { n: number; of: number } | undefined;
  /** Many photos at once: no folding, no focus — every facet stays open */
  composing: boolean;
  /** "+ value" (ADR-0043, R4): a new value in a facet, picked once created; false = refused */
  onAddValue?: (groupId: string, name: string) => Promise<boolean>;
};

/**
 * The Composer's inspector (ADR-0042, refined by ADR-0043): the shot first, then
 * the path tabs (keys 1–9, a pin each — a pinned path is carried over) and the
 * active path's facets under the photo's contexts. A facet shows what is
 * typical, the possible behind "more …"; a ONE facet folds once answered and
 * the next facet to answer is outlined. When the chosen values add up to a
 * named form, it is offered ("= seiza?").
 */
export function ComposerInspector({
  catalog,
  paths,
  activePathId,
  onPath,
  pinned,
  onPin,
  draft,
  tileState,
  onToggle,
  onCombination,
  onTakeCombination,
  creating,
  countByPath,
  countOf,
  composing,
  onAddValue,
}: ComposerInspectorProps) {
  const path = paths.find((p) => p.id === activePathId) ?? paths[0];
  const style = pathStyle(path?.name ?? "");
  const lead = useMemo(() => leadSection(catalog), [catalog]);
  const contexts = useMemo(() => contextsOf(catalog, draft), [catalog, draft]);
  const [reopened, setReopened] = useState<Set<string>>(() => new Set());
  const [moreOpen, setMoreOpen] = useState<Set<string>>(() => new Set());

  // The shot row is answered above the tabs; focus walks the path's own facets
  const focus = useMemo(
    () => (composing || !path ? null : nextFocusFacet(catalog, { ...path, sections: path.sections.filter((s) => s.id !== lead?.section.id && s.kind !== "MATRIX") }, contexts, draft)),
    [composing, path, catalog, lead, contexts, draft],
  );
  const facetRefs = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => {
    if (focus) facetRefs.current.get(focus)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focus]);

  const suggestions = useMemo(() => (onTakeCombination ? suggestCombinations(catalog, draft) : []), [onTakeCombination, catalog, draft]);

  // A pick in a reopened ONE facet folds it again
  const toggle = (tagId: string, additive: boolean) => {
    const g = catalog.tags[tagId]?.groupId;
    if (g && reopened.has(g) && !additive && !draft.includes(tagId))
      setReopened((r) => {
        const n = new Set(r);
        n.delete(g);
        return n;
      });
    onToggle(tagId, additive);
  };
  const add = (set: Set<string>, id: string) => new Set([...set, id]);

  if (!path) return null;
  const sections = path.sections.filter((s) => s.id !== lead?.section.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {lead && <ComposerShotRow catalog={catalog} section={lead.section} style={pathStyle(lead.path.name)} tileState={tileState} onToggle={onToggle} />}
      <div role="tablist" aria-label="Composer paths" className="flex flex-wrap gap-1 border-b border-border/60 p-2">
        {paths.map((p, i) => {
          const s = pathStyle(p.name);
          const active = p.id === path.id;
          const isPinned = pinned.has(p.id);
          return (
            <div
              key={p.id}
              className={cn(
                "flex min-w-[5.5rem] flex-1 items-center rounded-lg border transition-colors duration-150",
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

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-border/60 px-3 py-1.5" data-testid="composer-suggestions">
          <Sparkles size={12} aria-hidden className="text-muted-foreground" />
          {suggestions.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onTakeCombination?.(id)}
              data-testid="composer-suggestion"
              data-tag={catalog.tags[id]?.name}
              title={`${catalog.tags[id]?.description ?? ""} — replaces ${catalog.tags[id]?.parentIds.map((p) => catalog.tags[p]?.name).join(" + ")}`}
              className="rounded-full border border-dashed border-primary/50 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors duration-150 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              = {catalog.tags[id]?.name}?
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3" data-testid="composer-path-surface">
        {sections.map((section) => {
          if (section.kind === "MATRIX") {
            if (section.groupIds.every((g) => relevanceOf(catalog, contexts, { kind: "GROUP", id: g }) === "IMPOSSIBLE")) return null;
            return (
              <section key={section.id} aria-label={section.name}>
                <h3 className="mb-1.5 text-xs font-semibold">{section.name}</h3>
                <ComposerMatrix
                  catalog={catalog}
                  section={section}
                  draft={draft}
                  tileState={tileState}
                  style={style}
                  onToggle={onToggle}
                  onCombination={onCombination}
                  creating={creating}
                  countOf={countOf}
                  tileAspect={path.tileAspect}
                />
              </section>
            );
          }
          const views = section.groupIds
            .map((g) => facetView(catalog, contexts, g, draft))
            .filter((v) => v.shown.length + v.more.length > 0);
          if (views.length === 0) return null;
          return (
            <section key={section.id} aria-label={section.name}>
              <h3 className="mb-1.5 text-xs font-semibold">{section.name}</h3>
              <div className="space-y-2">
                {views.map((view) => (
                  <ComposerFacet
                    key={view.groupId}
                    ref={(el) => {
                      if (el) facetRefs.current.set(view.groupId, el);
                      else facetRefs.current.delete(view.groupId);
                    }}
                    catalog={catalog}
                    view={view}
                    chosen={(catalog.groups[view.groupId]?.tagIds ?? []).filter((id) => draft.includes(id))}
                    tileState={tileState}
                    style={style}
                    onToggle={toggle}
                    countOf={countOf}
                    tileAspect={tileAspectOfGroup(catalog, view.groupId)}
                    showName={views.length > 1 || section.name !== catalog.groups[view.groupId]?.name}
                    collapsed={!composing && facetCollapsed(catalog, view.groupId, draft, reopened)}
                    onReopen={() => setReopened((r) => add(r, view.groupId))}
                    focused={focus === view.groupId}
                    showMore={composing || moreOpen.has(view.groupId)}
                    onShowMore={() => setMoreOpen((m) => add(m, view.groupId))}
                    onAdd={onAddValue ? (name) => onAddValue(view.groupId, name) : undefined}
                  />
                ))}
              </div>
            </section>
          );
        })}
        {path.sections.some((s) => s.passable) && !composing && (
          <p className="text-[10px] text-muted-foreground">Click picks · in a “one” facet it replaces · Shift-click adds a second (two people)</p>
        )}
      </div>
    </div>
  );
}
