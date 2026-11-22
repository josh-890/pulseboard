// The Tag Composer's rules (ADR-0042) — pure and client-safe: what a tile click
// does to the draft, which refinements a chosen base posture opens, what is
// implied, what the next photo is offered, and how a state × garment combination
// is named. The server only stores the result (`applyComposition`).

export type ComposerSectionKind = "TILES" | "REFINEMENT" | "MATRIX";

export type ComposerTag = {
  id: string;
  name: string;
  description: string | null;
  groupId: string;
  /** First parent, then the further parents (ADR-0042) */
  parentIds: string[];
  /** The title example (S4): a photo of the user's, cropped to the tile */
  example?: { url: string; crop: { x: number; y: number; w: number; h: number } } | null;
  /** A user-uploaded line drawing (ADR-0043), preferred on the tile */
  drawingUrl?: string | null;
};

export type FacetChoice = "ONE" | "MANY";

export type ComposerGroup = {
  id: string;
  name: string;
  isExclusive: boolean;
  tagIds: string[];
  /** ADR-0043: ONE value per person (a pick replaces) or MANY; defaults to MANY */
  choice?: FacetChoice;
  /** Example framing for this facet, overriding the path's rule */
  framing?: { fill?: number | null; top?: number | null; tileAspect?: string | null };
};

export type ComposerSection = {
  id: string;
  name: string;
  kind: ComposerSectionKind;
  passable: boolean;
  groupIds: string[];
};

export type ComposerPath = {
  id: string;
  name: string;
  tileAspect: string;
  /** Carried over to the next photo by default */
  pinned: boolean;
  /** Its tags describe a person — attributed per person on a duo (ADR-0043) */
  personal?: boolean;
  sections: ComposerSection[];
};

export type ComposerStateRule = {
  stateGroupId: string;
  genericTagId: string;
  /** `{x}` stands for the garment's name */
  namePattern: string;
  garmentGroupIds: string[];
  garmentTagIds: string[];
  /** garment tag id → the combination's name, where it breaks the pattern */
  overrides: Record<string, string>;
};

export type RelevanceLevel = "TYPICAL" | "POSSIBLE" | "IMPOSSIBLE";

/** context tag id → `PATH:id` / `GROUP:id` / `TAG:id` → level (ADR-0043) */
export type RelevanceIndex = Record<string, Record<string, RelevanceLevel>>;

export type ComposerCatalog = {
  paths: ComposerPath[];
  groups: Record<string, ComposerGroup>;
  tags: Record<string, ComposerTag>;
  stateRules: ComposerStateRule[];
  /** Absent = no relevance rows: everything possible */
  relevance?: RelevanceIndex;
};

// ─── Lookups ────────────────────────────────────────────────────────────────

/** Every tag id the Composer shows — the tags of the groups its sections name */
export function composerTagIds(catalog: ComposerCatalog): Set<string> {
  const ids = new Set<string>();
  for (const p of catalog.paths)
    for (const s of p.sections) for (const g of s.groupIds) for (const t of catalog.groups[g]?.tagIds ?? []) ids.add(t);
  return ids;
}

/** tag id → the path that shows it */
export function pathByTag(catalog: ComposerCatalog): Map<string, string> {
  const byGroup = new Map<string, string>();
  for (const p of catalog.paths) for (const s of p.sections) for (const g of s.groupIds) byGroup.set(g, p.id);
  const result = new Map<string, string>();
  for (const t of Object.values(catalog.tags)) {
    const p = byGroup.get(t.groupId);
    if (p) result.set(t.id, p);
  }
  return result;
}

/** All ancestors of a tag through every parent, nearest first */
export function ancestorsOf(catalog: ComposerCatalog, tagId: string): string[] {
  const seen = new Set<string>();
  const queue = [...(catalog.tags[tagId]?.parentIds ?? [])];
  const out: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    queue.push(...(catalog.tags[id]?.parentIds ?? []));
  }
  return out;
}

/** Tags the draft implies but does not hold — shown as faint "auto" chips */
export function impliedTags(catalog: ComposerCatalog, draft: string[]): string[] {
  const held = new Set(draft);
  const out: string[] = [];
  for (const id of draft)
    for (const a of ancestorsOf(catalog, id))
      if (!held.has(a) && !out.includes(a)) out.push(a);
  return out;
}

/**
 * The base section of a path: the section right before a REFINEMENT. Its tiles
 * replace each other on a click and add on Shift-click (a duo: standing +
 * kneeling).
 */
export function baseSectionOf(path: ComposerPath): { base: ComposerSection; refinement: ComposerSection } | null {
  const i = path.sections.findIndex((s) => s.kind === "REFINEMENT");
  if (i <= 0) return null;
  return { base: path.sections[i - 1], refinement: path.sections[i] };
}

function tagsOfGroups(catalog: ComposerCatalog, groupIds: string[]): Set<string> {
  return new Set(groupIds.flatMap((g) => catalog.groups[g]?.tagIds ?? []));
}

/** The base tags and refinement tags of every path that has a refinement */
function postureSets(catalog: ComposerCatalog): { base: Set<string>; refinement: Set<string> } {
  const base = new Set<string>();
  const refinement = new Set<string>();
  for (const p of catalog.paths) {
    const pair = baseSectionOf(p);
    if (!pair) continue;
    for (const t of tagsOfGroups(catalog, pair.base.groupIds)) base.add(t);
    for (const t of tagsOfGroups(catalog, pair.refinement.groupIds)) refinement.add(t);
  }
  return { base, refinement };
}

/**
 * For each chosen base posture (in draft order) the refinements under it, at
 * any depth (fetal-position sits under on-side under lying).
 */
export function refinementOptions(
  catalog: ComposerCatalog,
  path: ComposerPath,
  draft: string[],
): { baseId: string; tagIds: string[] }[] {
  const pair = baseSectionOf(path);
  if (!pair) return [];
  const base = tagsOfGroups(catalog, pair.base.groupIds);
  const refinement = [...tagsOfGroups(catalog, pair.refinement.groupIds)];
  return draft
    .filter((id) => base.has(id))
    .map((baseId) => ({ baseId, tagIds: refinement.filter((r) => ancestorsOf(catalog, r).includes(baseId)) }));
}

/** Drop refinements no chosen base posture leads to any more */
function dropOrphans(catalog: ComposerCatalog, draft: string[]): string[] {
  const { base, refinement } = postureSets(catalog);
  const chosenBase = new Set(draft.filter((id) => base.has(id)));
  return draft.filter((id) => !refinement.has(id) || ancestorsOf(catalog, id).some((a) => chosenBase.has(a)));
}

// ─── Editing the draft ──────────────────────────────────────────────────────

/**
 * A tile click. Rules, in order:
 *   - a held tag is removed (and refinements it alone led to with it)
 *   - a base posture replaces the other base postures, unless `additive`
 *   - in an exclusive group a tag replaces the group's other tag
 *   - in a ONE facet (ADR-0043) a tag replaces the facet's other, unless `additive`
 *   - anything else is added
 * A refinement brings no base posture of its own: it is only offered under one.
 */
export function toggleTag(catalog: ComposerCatalog, draft: string[], tagId: string, additive = false): string[] {
  if (draft.includes(tagId)) return dropOrphans(catalog, draft.filter((id) => id !== tagId));
  const tag = catalog.tags[tagId];
  if (!tag) return draft;
  const { base } = postureSets(catalog);
  const group = catalog.groups[tag.groupId];
  let next = draft;
  if (base.has(tagId) && !additive) next = next.filter((id) => !base.has(id));
  else if (group?.isExclusive || (group?.choice === "ONE" && !additive))
    next = next.filter((id) => catalog.tags[id]?.groupId !== tag.groupId);
  return dropOrphans(catalog, [...next, tagId]);
}

/** What writing the draft changes on a photo that holds `own` */
export function compositionOf(own: string[], draft: string[]): { adds: string[]; removes: string[] } {
  const o = new Set(own);
  const d = new Set(draft);
  return { adds: draft.filter((id) => !o.has(id)), removes: own.filter((id) => !d.has(id)) };
}

/**
 * What the user changed on this photo and has not written: the draft against
 * the photo's own tags, leaving out carried-over proposals nobody touched (an
 * offer skipped is not work lost). Leaving the photo with any of this asks first.
 */
export function unsavedChanges(own: string[], draft: string[], proposed: string[]): { adds: string[]; removes: string[] } {
  const { adds, removes } = compositionOf(own, draft);
  const offered = new Set(proposed);
  return { adds: adds.filter((id) => !offered.has(id)), removes };
}

/**
 * The draft a photo opens with. Its own tags, plus — for every pinned path the
 * photo has nothing in yet — what was last written in that path (carry-over).
 * The carried tags come back as `proposed`, so they read as an offer.
 */
export function openDraft(
  catalog: ComposerCatalog,
  own: string[],
  lastWritten: string[],
  pinnedPathIds: Set<string>,
): { draft: string[]; proposed: string[] } {
  const byPath = pathByTag(catalog);
  const ownPaths = new Set(own.map((id) => byPath.get(id)));
  const proposed = lastWritten.filter((id) => {
    const p = byPath.get(id);
    return p !== undefined && pinnedPathIds.has(p) && !ownPaths.has(p) && !own.includes(id);
  });
  return { draft: [...own, ...proposed], proposed };
}

// ─── The state matrix ───────────────────────────────────────────────────────

/** The states that fit a garment */
export function statesForGarment(catalog: ComposerCatalog, garmentId: string): ComposerStateRule[] {
  const g = catalog.tags[garmentId];
  if (!g) return [];
  return catalog.stateRules.filter((r) => r.garmentTagIds.includes(garmentId) || r.garmentGroupIds.includes(g.groupId));
}

/** `torn-{x}` + bra → `torn-bra`; an override wins (`panties` → `panty-pull`) */
export function combinationName(rule: ComposerStateRule, garment: ComposerTag): string {
  return rule.overrides[garment.id] ?? rule.namePattern.replace("{x}", garment.name);
}

/** The combination tag if the catalogue already has it */
export function findCombination(catalog: ComposerCatalog, rule: ComposerStateRule, garmentId: string): ComposerTag | null {
  const garment = catalog.tags[garmentId];
  if (!garment) return null;
  const name = combinationName(rule, garment);
  return Object.values(catalog.tags).find((t) => t.name === name) ?? null;
}

/**
 * The garments the matrix offers rows for: those in the draft, and those a
 * combination in the draft implies (a photo tagged only `torn-bra` still shows
 * its bra row).
 */
export function matrixGarments(catalog: ComposerCatalog, draft: string[]): string[] {
  const isGarment = (id: string) => statesForGarment(catalog, id).length > 0;
  const out: string[] = [];
  for (const id of draft) {
    for (const g of [id, ...ancestorsOf(catalog, id)]) if (isGarment(g) && !out.includes(g)) out.push(g);
  }
  return out;
}

// ─── Many photos at once (S3) ───────────────────────────────────────────────

/** Tags to add and tags to remove — one composition for a selection or a brush */
export type Composition = { adds: string[]; removes: string[] };

export const EMPTY_COMPOSITION: Composition = { adds: [], removes: [] };

/** tag id → how many of the photos carry it (direct tags) */
export function tagCounts(tagLists: string[][]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const list of tagLists) for (const id of new Set(list)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/** Drop tags, and the refinements no remaining base posture leads to */
export function withoutTags(catalog: ComposerCatalog, own: string[], ids: Iterable<string>): string[] {
  const drop = new Set(ids);
  return dropOrphans(catalog, own.filter((id) => !drop.has(id)));
}

/**
 * A tile click on a selection (Hydrus-style counts). Rules:
 *   - a tag being added or removed goes back to untouched (an add also takes
 *     back the removals it caused)
 *   - a tag every photo has is marked for removal (a base posture takes its
 *     refinements with it)
 *   - otherwise it is added; a base posture (unless `additive`) or a tag of an
 *     exclusive group marks the others of its kind present on the photos for
 *     removal, and refinements of other base postures with them
 */
export function toggleInComposition(
  catalog: ComposerCatalog,
  comp: Composition,
  tagId: string,
  counts: Map<string, number>,
  total: number,
  additive = false,
): Composition {
  const { base, refinement } = postureSets(catalog);
  const present = (id: string) => (counts.get(id) ?? 0) > 0;
  const groupOf = (id: string) => catalog.tags[id]?.groupId;
  const exclusive = catalog.groups[groupOf(tagId) ?? ""]?.isExclusive ?? false;
  const isBase = base.has(tagId);
  const sameKind = (id: string) => (isBase ? base.has(id) || refinement.has(id) : exclusive && groupOf(id) === groupOf(tagId));

  if (comp.adds.includes(tagId))
    return { adds: comp.adds.filter((x) => x !== tagId), removes: comp.removes.filter((x) => !sameKind(x)) };
  if (comp.removes.includes(tagId)) return { adds: comp.adds, removes: comp.removes.filter((x) => x !== tagId) };

  const removes = new Set(comp.removes);
  let adds = comp.adds;
  if (total > 0 && (counts.get(tagId) ?? 0) === total) {
    removes.add(tagId);
    if (isBase) for (const r of refinement) if (present(r) && ancestorsOf(catalog, r).includes(tagId)) removes.add(r);
    return { adds, removes: [...removes] };
  }

  removes.delete(tagId);
  if (isBase && !additive) {
    adds = adds.filter((x) => !base.has(x) && !(refinement.has(x) && !ancestorsOf(catalog, x).includes(tagId)));
    for (const b of base) if (b !== tagId && present(b)) removes.add(b);
    for (const r of refinement) if (present(r) && !ancestorsOf(catalog, r).includes(tagId)) removes.add(r);
  } else if (exclusive) {
    adds = adds.filter((x) => groupOf(x) !== groupOf(tagId));
    for (const id of catalog.groups[groupOf(tagId)!].tagIds) if (id !== tagId && present(id)) removes.add(id);
  }
  return { adds: [...adds, tagId], removes: [...removes] };
}

/**
 * What a selection looks like through its composition, for the refinement and
 * matrix sections: tags some photo has or the composition adds, minus removals.
 */
export function compositionView(comp: Composition, counts: Map<string, number>): string[] {
  const removed = new Set(comp.removes);
  const out = [...counts.keys()].filter((id) => !removed.has(id));
  for (const id of comp.adds) if (!out.includes(id)) out.push(id);
  return out;
}

/** A photo's tags after a composition — for the optimistic view; the server's answer wins */
export function applyCompositionTo(catalog: ComposerCatalog, own: string[], comp: Composition): string[] {
  let next = withoutTags(catalog, own, comp.removes);
  for (const id of comp.adds) {
    if (next.includes(id)) continue;
    const g = catalog.tags[id]?.groupId;
    if (g && catalog.groups[g]?.isExclusive) next = next.filter((x) => catalog.tags[x]?.groupId !== g);
    next = [...next, id];
  }
  return next;
}

/** The brush turned eraser (Alt): what it would add, it takes away */
export function eraserOf(comp: Composition): Composition {
  return { adds: [], removes: comp.adds };
}

/**
 * Pass mode (Prodigy): one key per photo picks the section's tag — replacing
 * whatever the photo had in that section. Already held: nothing changes.
 */
export function passChoice(catalog: ComposerCatalog, own: string[], sectionTagIds: Set<string>, tagId: string): string[] {
  if (own.includes(tagId)) return own;
  return toggleTag(catalog, own.filter((id) => !sectionTagIds.has(id)), tagId, false);
}

/**
 * A preset (S6) played as clicks, so it follows the same rules: onto one
 * photo's tags (a base posture replaces, an exclusive tag replaces) …
 */
export function presetOnto(catalog: ComposerCatalog, tags: string[], preset: Composition): string[] {
  let next = withoutTags(catalog, tags, preset.removes);
  for (const a of preset.adds) if (!next.includes(a) && catalog.tags[a]) next = toggleTag(catalog, next, a, false);
  return next;
}

/** … or as a selection's composition (a tag every photo has already is left alone) */
export function presetAsComposition(catalog: ComposerCatalog, preset: Composition, counts: Map<string, number>, total: number): Composition {
  let comp: Composition = { adds: [], removes: preset.removes.filter((id) => catalog.tags[id] && (counts.get(id) ?? 0) > 0) };
  for (const a of preset.adds) {
    if (!catalog.tags[a] || (total > 0 && (counts.get(a) ?? 0) === total)) continue;
    comp = toggleInComposition(catalog, comp, a, counts, total);
  }
  return comp;
}


// ─── Relevance (ADR-0043) ───────────────────────────────────────────────────
//
// A context tag on the photo (a base posture, a framing, a region) says how
// relevant a path, a facet or a value is: typical, possible or impossible.
// Within one context the most specific row answers (value → facet → path);
// across the contexts present the strictest level wins — so a framing that
// hides a facet cannot be overruled by a base posture that likes one of its
// values. A context with no row has no say; no say at all means possible.

const STRICTNESS: Record<RelevanceLevel, number> = { TYPICAL: 0, POSSIBLE: 1, IMPOSSIBLE: 2 };

function pathOfGroup(catalog: ComposerCatalog, groupId: string): string | undefined {
  for (const p of catalog.paths) if (p.sections.some((s) => s.groupIds.includes(groupId))) return p.id;
  return undefined;
}

/** The level of a path, a facet or a value under the contexts present */
export function relevanceOf(
  catalog: ComposerCatalog,
  contexts: Iterable<string>,
  target: { kind: "PATH" | "GROUP" | "TAG"; id: string },
): RelevanceLevel {
  const index = catalog.relevance;
  if (!index) return "POSSIBLE";
  const groupId = target.kind === "TAG" ? catalog.tags[target.id]?.groupId : target.kind === "GROUP" ? target.id : undefined;
  const pathId = target.kind === "PATH" ? target.id : groupId ? pathOfGroup(catalog, groupId) : undefined;
  const chain = [
    ...(target.kind === "TAG" ? [`TAG:${target.id}`] : []),
    ...(groupId ? [`GROUP:${groupId}`] : []),
    ...(pathId ? [`PATH:${pathId}`] : []),
  ];
  let result: RelevanceLevel | null = null;
  for (const c of contexts) {
    const rows = index[c];
    if (!rows) continue;
    const said = chain.map((k) => rows[k]).find((l) => l !== undefined);
    if (said && (result === null || STRICTNESS[said] > STRICTNESS[result])) result = said;
  }
  return result ?? "POSSIBLE";
}

export type FacetView = {
  groupId: string;
  level: RelevanceLevel;
  /** Shown at once */
  shown: string[];
  /** Behind "more …" */
  more: string[];
  /** The shown values are typical in this context (not merely possible) */
  typical: boolean;
};

/**
 * A facet under the contexts present: its typical values shown, the possible
 * ones behind "more …" — or shown at once when nothing is typical — and the
 * impossible ones left out. Values already held always show.
 */
export function facetView(catalog: ComposerCatalog, contexts: Iterable<string>, groupId: string, held: Iterable<string> = []): FacetView {
  const ctx = [...contexts];
  const have = new Set(held);
  const level = relevanceOf(catalog, ctx, { kind: "GROUP", id: groupId });
  const typical: string[] = [];
  const possible: string[] = [];
  for (const id of catalog.groups[groupId]?.tagIds ?? []) {
    const l = have.has(id) ? "TYPICAL" : relevanceOf(catalog, ctx, { kind: "TAG", id });
    if (l === "TYPICAL") typical.push(id);
    else if (l === "POSSIBLE") possible.push(id);
  }
  return typical.length === 0
    ? { groupId, level, shown: possible, more: [], typical: false }
    : { groupId, level, shown: typical, more: possible, typical: true };
}

/** A path is offered unless every context hides it */
export function pathVisible(catalog: ComposerCatalog, contexts: Iterable<string>, pathId: string): boolean {
  return relevanceOf(catalog, contexts, { kind: "PATH", id: pathId }) !== "IMPOSSIBLE";
}

/**
 * Where the eye goes next (focus flow): the first facet of the path, in tree
 * order, that has something typical to offer and nothing chosen yet.
 */
export function nextFocusFacet(catalog: ComposerCatalog, path: ComposerPath, contexts: Iterable<string>, draft: string[]): string | null {
  const ctx = [...contexts];
  const held = new Set(draft);
  for (const section of path.sections)
    for (const g of section.groupIds) {
      const tags = catalog.groups[g]?.tagIds ?? [];
      if (tags.some((t) => held.has(t))) continue;
      const view = facetView(catalog, ctx, g);
      if (view.typical || view.level === "TYPICAL") return g;
    }
  return null;
}

// ─── Combinations (ADR-0043) ────────────────────────────────────────────────

/**
 * Named forms the chosen values add up to: a tag with two or more parents, all
 * of them in the draft, itself not yet held — offered as "= seiza?", never
 * applied on its own.
 */
export function suggestCombinations(catalog: ComposerCatalog, draft: string[]): string[] {
  const held = new Set(draft);
  return Object.values(catalog.tags)
    .filter((t) => t.parentIds.length >= 2 && !held.has(t.id) && t.parentIds.every((p) => held.has(p)))
    .map((t) => t.id);
}

/** Take a suggestion: the combination replaces the values it is made of */
export function applyCombination(catalog: ComposerCatalog, draft: string[], comboId: string): string[] {
  const parts = new Set(catalog.tags[comboId]?.parentIds ?? []);
  return [...draft.filter((id) => !parts.has(id)), comboId];
}
