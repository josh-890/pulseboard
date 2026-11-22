import type { ComposerCatalog, ComposerPath } from "@/lib/composer";

// What Settings → Composer has selected (ADR-0043, R4): a path, one of its
// sections, a facet in a section, or a value of a facet.

export type ManageNode =
  | { kind: "path"; id: string }
  | { kind: "section"; id: string; pathId: string }
  | { kind: "facet"; id: string; sectionId: string }
  | { kind: "value"; id: string; groupId: string };

export function nodeKey(n: ManageNode): string {
  return n.kind === "facet" ? `facet:${n.sectionId}:${n.id}` : `${n.kind}:${n.id}`;
}

/** The path a node sits in */
export function pathOfNode(catalog: ComposerCatalog, n: ManageNode): ComposerPath | undefined {
  switch (n.kind) {
    case "path":
      return catalog.paths.find((p) => p.id === n.id);
    case "section":
      return catalog.paths.find((p) => p.id === n.pathId);
    case "facet":
      return catalog.paths.find((p) => p.sections.some((s) => s.id === n.sectionId));
    case "value":
      return catalog.paths.find((p) => p.sections.some((s) => s.groupIds.includes(n.groupId)));
  }
}

/** The ids with one moved a step up or down — null at the edge */
export function moved(ids: string[], id: string, step: -1 | 1): string[] | null {
  const i = ids.indexOf(id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
