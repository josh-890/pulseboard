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
};

export type ComposerGroup = { id: string; name: string; isExclusive: boolean; tagIds: string[] };

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

export type ComposerCatalog = {
  paths: ComposerPath[];
  groups: Record<string, ComposerGroup>;
  tags: Record<string, ComposerTag>;
  stateRules: ComposerStateRule[];
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
 *   - anything else is added
 * A refinement brings no base posture of its own: it is only offered under one.
 */
export function toggleTag(catalog: ComposerCatalog, draft: string[], tagId: string, additive = false): string[] {
  if (draft.includes(tagId)) return dropOrphans(catalog, draft.filter((id) => id !== tagId));
  const tag = catalog.tags[tagId];
  if (!tag) return draft;
  const { base } = postureSets(catalog);
  let next = draft;
  if (base.has(tagId) && !additive) next = next.filter((id) => !base.has(id));
  else if (catalog.groups[tag.groupId]?.isExclusive) next = next.filter((id) => catalog.tags[id]?.groupId !== tag.groupId);
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
