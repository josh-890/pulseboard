"use client";

import { useState } from "react";
import { MapPin, PenLine } from "lucide-react";
import type { ComposerCatalog } from "@/lib/composer";
import { pathStyle } from "@/components/composer/composer-path-style";
import { moved, nodeKey, type ManageNode } from "./composer-manage-node";
import { ComposerTreeRow } from "./composer-tree-row";

export type ComposerTreeProps = {
  catalog: ComposerCatalog;
  usage: Record<string, number>;
  selected: ManageNode | null;
  onSelect: (node: ManageNode) => void;
  /** Put a parent's children in a new order */
  onReorder: (kind: ManageNode["kind"], parentId: string | null, ids: string[]) => void;
  busy: boolean;
};

const LEVEL_LABEL = { TYPICAL: "typical", POSSIBLE: "possible", IMPOSSIBLE: "waits" } as const;

/**
 * The Composer's tree (ADR-0043, R4): paths → sections → facets → values, in the
 * order the workbench shows them. A row selects; ↑ ↓ move it among its
 * siblings (shown on the selected row, and on hover or focus).
 */
export function ComposerTree({ catalog, usage, selected, onSelect, onReorder, busy }: ComposerTreeProps) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(catalog.paths.slice(0, 1).map((p) => `path:${p.id}`)));
  const toggle = (key: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const selKey = selected ? nodeKey(selected) : null;

  /** The props every row shares: selection, folding, moving among `siblings` */
  const rowOf = (node: ManageNode, siblings: string[], parentId: string | null, expandable: boolean) => {
    const key = nodeKey(node);
    const i = siblings.indexOf(node.id);
    return {
      kind: node.kind,
      selected: selKey === key,
      expanded: expandable ? open.has(key) : undefined,
      onExpand: () => toggle(key),
      onSelect: () => {
        onSelect(node);
        if (expandable && !open.has(key)) toggle(key);
      },
      onMove: (step: -1 | 1) => {
        const next = moved(siblings, node.id, step);
        if (next) onReorder(node.kind, parentId, next);
      },
      canMove: { up: !busy && i > 0, down: !busy && i >= 0 && i < siblings.length - 1 },
    };
  };

  const pathIds = catalog.paths.map((p) => p.id);
  return (
    <div role="tree" aria-label="Composer tree" className="space-y-0.5" data-testid="composer-tree">
      {catalog.paths.map((p) => {
        const pNode: ManageNode = { kind: "path", id: p.id };
        const sectionIds = p.sections.map((s) => s.id);
        return (
          <div key={p.id} role="group">
            <ComposerTreeRow
              {...rowOf(pNode, pathIds, null, true)}
              depth={0}
              name={p.name}
              dot={pathStyle(p.name).dot}
              meta={p.personal ? "per person" : undefined}
            />
            {open.has(nodeKey(pNode)) &&
              p.sections.map((s) => {
                const sNode: ManageNode = { kind: "section", id: s.id, pathId: p.id };
                return (
                  <div key={s.id} role="group">
                    <ComposerTreeRow
                      {...rowOf(sNode, sectionIds, p.id, true)}
                      depth={1}
                      name={s.name}
                      meta={s.kind !== "TILES" ? s.kind.toLowerCase() : s.passable ? "pass" : undefined}
                    />
                    {open.has(nodeKey(sNode)) &&
                      s.groupIds.map((g) => {
                        const group = catalog.groups[g];
                        if (!group) return null;
                        const fNode: ManageNode = { kind: "facet", id: g, sectionId: s.id };
                        const level = group.defaultLevel ?? "POSSIBLE";
                        return (
                          <div key={g} role="group">
                            <ComposerTreeRow
                              {...rowOf(fNode, s.groupIds, s.id, true)}
                              depth={2}
                              name={group.name}
                              meta={
                                <>
                                  <span>{group.choice === "ONE" ? "one" : "many"}</span>
                                  {level !== "POSSIBLE" && <span>· {LEVEL_LABEL[level]}</span>}
                                  <span className="tabular-nums">· {group.tagIds.length}</span>
                                </>
                              }
                            />
                            {open.has(nodeKey(fNode)) &&
                              group.tagIds.map((t) => {
                                const tag = catalog.tags[t];
                                if (!tag) return null;
                                return (
                                  <ComposerTreeRow
                                    key={t}
                                    {...rowOf({ kind: "value", id: t, groupId: g }, group.tagIds, g, false)}
                                    depth={3}
                                    name={tag.name}
                                    meta={
                                      <>
                                        {tag.parentIds.length > 1 && <span title="A named form of its parts">= {tag.parentIds.length}</span>}
                                        {tag.drawingUrl && <PenLine size={11} aria-label="Has a drawing" />}
                                        {tag.region && <MapPin size={11} aria-label="Linked to a body region" />}
                                        {(usage[t] ?? 0) > 0 && <span className="tabular-nums">{usage[t]}</span>}
                                      </>
                                    }
                                  />
                                );
                              })}
                          </div>
                        );
                      })}
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
