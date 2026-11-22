"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  contextsTouching,
  nextCellLevel,
  relevanceCell,
  type ComposerCatalog,
  type RelevanceIndex,
  type RelevanceLevel,
} from "@/lib/composer";
import type { SimpleActionResult } from "@/lib/types";
import { setComposerRelevanceAction, updateComposerFacetAction } from "@/lib/actions/composer-manage-actions";
import { pathStyle } from "@/components/composer/composer-path-style";
import { ComposerRelevanceCell, LEVEL_MARK } from "./composer-relevance-cell";
import { ComposerTagPicker } from "./composer-tag-picker";
import { ComposerTagChip } from "./composer-tag-chip";

export type ComposerRelevanceMatrixProps = {
  catalog: ComposerCatalog;
  pathId: string;
  onPath: (pathId: string) => void;
  /** A facet to unfold on arrival (from the facet panel) */
  focusGroupId?: string | null;
  call: (action: () => Promise<SimpleActionResult>) => Promise<void>;
  pending: boolean;
};

type Target = { kind: "PATH" | "GROUP" | "TAG"; id: string };

const DEFAULT_CYCLE: Record<RelevanceLevel, RelevanceLevel> = { POSSIBLE: "IMPOSSIBLE", IMPOSSIBLE: "TYPICAL", TYPICAL: "POSSIBLE" };

/**
 * The relevance matrix (ADR-0043, R4): one path at a time; rows are the path,
 * its facets and — unfolded — their values; columns are the contexts chosen
 * (whole groups such as Framing or Posture, or single tags). A click cycles the
 * cell ● typical → ○ possible → ✕ hidden → inherit. The Default column is the
 * facet's level where no context present has a say.
 */
export function ComposerRelevanceMatrix({ catalog, pathId, onPath, focusGroupId, call, pending }: ComposerRelevanceMatrixProps) {
  // Cells are written at once and shown at once; a refresh from the server replaces them
  const [rel, setRel] = useState<RelevanceIndex>(() => catalog.relevance ?? {});
  const [seen, setSeen] = useState(catalog.relevance);
  if (seen !== catalog.relevance) {
    setSeen(catalog.relevance);
    setRel(catalog.relevance ?? {});
  }
  const view = useMemo(() => ({ ...catalog, relevance: rel }), [catalog, rel]);
  const path = catalog.paths.find((p) => p.id === pathId) ?? catalog.paths[0];

  // Context groups: every group a context tag with rows comes from
  const contextGroups = useMemo(() => {
    const ids: string[] = [];
    for (const ctx of Object.keys(rel)) {
      const g = catalog.tags[ctx]?.groupId;
      if (g && !ids.includes(g)) ids.push(g);
    }
    const order = catalog.paths.flatMap((p) => p.sections.flatMap((s) => s.groupIds));
    return ids.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [rel, catalog]);

  const [chosen, setChosen] = useState<Record<string, Set<string>>>({});
  const [extra, setExtra] = useState<string[]>([]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(focusGroupId ? [focusGroupId] : []));
  const touching = useMemo(() => new Set(contextsTouching(view, path?.id ?? "").map((c) => catalog.tags[c]?.groupId)), [view, path, catalog.tags]);
  const groupsOn = useMemo(
    () => chosen[path?.id ?? ""] ?? new Set(contextGroups.filter((g) => touching.has(g))),
    [chosen, path, contextGroups, touching],
  );
  const setGroupsOn = (next: Set<string>) => setChosen((c) => ({ ...c, [path?.id ?? ""]: next }));

  const columns = useMemo(() => {
    const cols: { groupId: string; tagIds: string[] }[] = contextGroups
      .filter((g) => groupsOn.has(g))
      .map((g) => ({ groupId: g, tagIds: catalog.groups[g]?.tagIds ?? [] }));
    const singles = extra.filter((t) => !cols.some((c) => c.tagIds.includes(t)));
    if (singles.length) cols.push({ groupId: "", tagIds: singles });
    return cols;
  }, [contextGroups, groupsOn, extra, catalog.groups]);
  const contextIds = columns.flatMap((c) => c.tagIds);

  if (!path) return <p className="text-sm text-muted-foreground">No Composer paths yet.</p>;

  const setCell = async (ctx: string, target: Target) => {
    const { own } = relevanceCell(view, ctx, target);
    const next = nextCellLevel(own);
    const key = `${target.kind}:${target.id}`;
    const apply = (level: RelevanceLevel | null) =>
      setRel((r) => {
        const rows = { ...(r[ctx] ?? {}) };
        if (level) rows[key] = level;
        else delete rows[key];
        return { ...r, [ctx]: rows };
      });
    apply(next);
    const res = await setComposerRelevanceAction(ctx, target.kind, target.id, next);
    if (!res.success) {
      apply(own);
      toast.error(res.error ?? "Could not save the cell");
    }
  };

  const nameOf = (t: Target) =>
    t.kind === "PATH" ? `${path.name} (whole path)` : t.kind === "GROUP" ? catalog.groups[t.id]?.name : catalog.tags[t.id]?.name;

  const cells = (target: Target) =>
    contextIds.map((ctx) => {
      const { own, inherited } = relevanceCell(view, ctx, target);
      const self = target.kind === "TAG" && target.id === ctx;
      return (
        <td key={ctx} className="p-0 text-center">
          <ComposerRelevanceCell
            own={own}
            inherited={inherited}
            label={`${catalog.tags[ctx]?.name} × ${nameOf(target)}`}
            onClick={() => void setCell(ctx, target)}
            disabled={self}
          />
        </td>
      );
    });

  return (
    <div className="space-y-3" data-testid="composer-matrix">
      <div role="tablist" aria-label="Paths" className="flex flex-wrap gap-1">
        {catalog.paths.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={p.id === path.id}
            onClick={() => onPath(p.id)}
            data-testid={`composer-matrix-path-${p.name}`}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              p.id === path.id ? pathStyle(p.name).on : "border-transparent hover:bg-muted/50",
            )}
          >
            <span aria-hidden className={cn("h-2 w-2 rounded-full", pathStyle(p.name).dot)} />
            {p.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Contexts:</span>
        {contextGroups.map((g) => {
          const on = groupsOn.has(g);
          return (
            <button
              key={g}
              type="button"
              aria-pressed={on}
              data-testid="composer-matrix-context-group"
              data-group={catalog.groups[g]?.name}
              onClick={() => {
                const n = new Set(groupsOn);
                if (on) n.delete(g);
                else n.add(g);
                setGroupsOn(n);
              }}
              className={cn(
                "rounded-full border px-2 py-0.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary/50 bg-primary/10 font-medium" : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {catalog.groups[g]?.name}
            </button>
          );
        })}
        {extra.map((t) => (
          <ComposerTagChip key={t} name={catalog.tags[t]?.name ?? t} onRemove={() => setExtra(extra.filter((x) => x !== t))} />
        ))}
        <div className="w-44">
          <ComposerTagPicker
            catalog={catalog}
            label="Another context"
            exclude={new Set(contextIds)}
            onPick={(t) => setExtra([...extra, t])}
            testId="composer-matrix-add-context"
          />
        </div>
      </div>

      <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {(["TYPICAL", "POSSIBLE", "IMPOSSIBLE"] as const).map((l) => (
          <span key={l}>
            <span className={cn("font-bold", LEVEL_MARK[l].tone)}>{LEVEL_MARK[l].mark}</span> {LEVEL_MARK[l].word}
          </span>
        ))}
        <span>bold = set here · faint = inherited from the facet or path · · = no say (the facet&apos;s default answers)</span>
        <span>Across contexts on a photo, the strictest wins.</span>
      </p>

      {contextIds.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">Choose contexts above to see their columns.</p>
      ) : (
        <div className="max-h-[70vh] overflow-auto rounded-xl border border-border/60">
          <table className="border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                <th scope="col" rowSpan={2} className="sticky left-0 z-20 min-w-44 border-b border-border/60 bg-card px-2 py-1 text-left align-bottom font-semibold">
                  {path.name}
                </th>
                <th scope="col" rowSpan={2} className="border-b border-border/60 px-1 py-1 align-bottom font-medium text-muted-foreground" title="Where no context present has a say">
                  Default
                </th>
                {columns.map((c) => (
                  <th key={c.groupId || "single"} scope="colgroup" colSpan={c.tagIds.length} className="border-b border-l border-border/60 px-1 py-0.5 text-left font-semibold">
                    {c.groupId ? catalog.groups[c.groupId]?.name : "Others"}
                  </th>
                ))}
              </tr>
              <tr>
                {columns.map((c) =>
                  c.tagIds.map((t, i) => (
                    <th
                      key={t}
                      scope="col"
                      data-testid="composer-matrix-context"
                      data-tag={catalog.tags[t]?.name}
                      className={cn("h-24 border-b border-border/60 px-0.5 pb-1 align-bottom font-normal", i === 0 && "border-l")}
                    >
                      <span className="inline-block max-h-24 truncate [writing-mode:vertical-rl] rotate-180">{catalog.tags[t]?.name}</span>
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              <tr data-testid="composer-matrix-row" data-row={`${path.name} (path)`}>
                <th scope="row" className="sticky left-0 z-[1] bg-card px-2 py-0.5 text-left font-semibold italic">
                  whole path
                </th>
                <td />
                {cells({ kind: "PATH", id: path.id })}
              </tr>
              {path.sections.map((s) => (
                <Fragment key={s.id}>
                  <tr>
                    <th scope="rowgroup" colSpan={2 + contextIds.length} className="sticky left-0 bg-muted/40 px-2 py-0.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {s.name}
                    </th>
                  </tr>
                  {s.groupIds.map((g) => {
                    const group = catalog.groups[g];
                    if (!group) return null;
                    const isOpen = open.has(g);
                    const level = group.defaultLevel ?? "POSSIBLE";
                    return (
                      <Fragment key={g}>
                        <tr data-testid="composer-matrix-row" data-row={group.name}>
                          <th scope="row" className="sticky left-0 z-[1] bg-card px-1 py-0.5 text-left font-medium">
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              onClick={() =>
                                setOpen((o) => {
                                  const n = new Set(o);
                                  if (n.has(g)) n.delete(g);
                                  else n.add(g);
                                  return n;
                                })
                              }
                              className="flex items-center gap-1 rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <ChevronRight size={12} aria-hidden className={cn("transition-transform duration-150 motion-reduce:transition-none", isOpen && "rotate-90")} />
                              {group.name}
                            </button>
                          </th>
                          <td className="p-0 text-center">
                            <ComposerRelevanceCell
                              own={level}
                              inherited={null}
                              label={`Default of ${group.name}`}
                              disabled={pending}
                              onClick={() => void call(() => updateComposerFacetAction(g, { defaultLevel: DEFAULT_CYCLE[level] })).catch(() => {})}
                            />
                          </td>
                          {cells({ kind: "GROUP", id: g })}
                        </tr>
                        {isOpen &&
                          group.tagIds.map((t) => (
                            <tr key={t} data-testid="composer-matrix-row" data-row={catalog.tags[t]?.name}>
                              <th scope="row" className="sticky left-0 z-[1] bg-card py-0.5 pl-7 pr-2 text-left font-normal text-muted-foreground">
                                {catalog.tags[t]?.name}
                              </th>
                              <td />
                              {cells({ kind: "TAG", id: t })}
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
