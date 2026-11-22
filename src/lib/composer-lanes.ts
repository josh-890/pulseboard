import { compositionOf, impliedTags, toggleTag, type ComposerCatalog } from "@/lib/composer";

// Person lanes (ADR-0043): the photo's tags stay on the photo; an attribution
// says whom a tag of a personal path (Figure, Expression, Clothing, Detail)
// describes. These are the pure rules the workbench follows:
//
//   - no one shown: everything is the photo's, as before
//   - one person shown (solo): the photo's draft is hers — personal tags are
//     written attributed to her, and older unattributed ones are attributed on
//     the next write
//   - two or more (a duo): a person bar; personal tags are picked per person, a
//     ONE facet holds per person; the photo's draft is the union. Tags written
//     before lanes existed (no attribution) wait to be given to someone.
//
// Selection, brush and pass stay on the photo level.

/** person id → that person's Composer tags on the photo */
export type PersonTags = Record<string, string[]>;

/** One write: a change on the photo level (`personId` null) or one person's */
export type LaneWrite = { personId: string | null; adds: string[]; removes: string[] };

/** The tags of the paths marked personal */
export function personalTagIds(catalog: ComposerCatalog): Set<string> {
  const groups = new Set(catalog.paths.filter((p) => p.personal).flatMap((p) => p.sections.flatMap((s) => s.groupIds)));
  return new Set(Object.values(catalog.tags).filter((t) => groups.has(t.groupId)).map((t) => t.id));
}

/** Personal tags on the photo nobody is attributed to (written before lanes) */
export function unattributed(personal: Set<string>, own: string[], ownPersons: PersonTags): string[] {
  const given = new Set(Object.values(ownPersons).flat());
  return own.filter((id) => personal.has(id) && !given.has(id));
}

/** The photo's draft in a duo: its non-personal tags, the tags still waiting, and every person's */
export function photoDraftOf(personal: Set<string>, draft: string[], waiting: string[], personDrafts: PersonTags): string[] {
  const out = draft.filter((id) => !personal.has(id));
  for (const id of [...waiting, ...Object.values(personDrafts).flat()]) if (!out.includes(id)) out.push(id);
  return out;
}

/** What the inspector shows in a person's lane: the photo's non-personal tags and that person's */
export function laneView(personal: Set<string>, draft: string[], personDraft: string[]): string[] {
  return [...draft.filter((id) => !personal.has(id)), ...personDraft];
}

/** A click in a person's lane: a personal tag goes to that person (ONE per person), anything else to the photo */
export function toggleInLane(
  catalog: ComposerCatalog,
  personal: Set<string>,
  draft: string[],
  personDraft: string[],
  tagId: string,
  additive: boolean,
): { draft: string[]; personDraft: string[] } {
  if (!personal.has(tagId)) return { draft: toggleTag(catalog, draft, tagId, additive), personDraft };
  return { draft, personDraft: toggleTag(catalog, personDraft, tagId, additive) };
}

/** Tags implied in a person's lane (seiza → sitting), for the faint ticks */
export function laneImplied(catalog: ComposerCatalog, view: string[]): string[] {
  return impliedTags(catalog, view);
}

/**
 * The writes that bring the photo from what it holds to the drafts. Photo-level
 * first (a removal there takes every attribution), then each person's.
 */
export function laneWrites(
  catalog: ComposerCatalog,
  args: { own: string[]; ownPersons: PersonTags; draft: string[]; personDrafts: PersonTags; shown: string[] },
): LaneWrite[] {
  const personal = personalTagIds(catalog);
  const { own, ownPersons, draft, personDrafts, shown } = args;
  const writes: LaneWrite[] = [];
  const push = (personId: string | null, c: { adds: string[]; removes: string[] }) => {
    if (c.adds.length || c.removes.length) writes.push({ personId, adds: c.adds, removes: c.removes });
  };

  if (shown.length < 2) {
    if (shown.length === 0) {
      push(null, compositionOf(own, draft));
      return writes;
    }
    // Solo: removals on the photo level (whoever held them), additions attributed to her —
    // together with what she holds unattributed so far
    const solo = shown[0];
    const all = compositionOf(own, draft);
    const nonPersonalAdds = all.adds.filter((id) => !personal.has(id));
    push(null, { adds: nonPersonalAdds, removes: all.removes });
    const mine = new Set(ownPersons[solo] ?? []);
    const attribute = draft.filter((id) => personal.has(id) && !mine.has(id));
    push(solo, { adds: attribute, removes: [] });
    return writes;
  }

  const nonPersonal = (ids: string[]) => ids.filter((id) => !personal.has(id));
  push(null, compositionOf(nonPersonal(own), nonPersonal(draft)));
  for (const p of shown) push(p, compositionOf(ownPersons[p] ?? [], personDrafts[p] ?? []));
  return writes;
}

/** Whether any person's draft differs from what the photo holds for them */
export function personsDirty(ownPersons: PersonTags, personDrafts: PersonTags): boolean {
  for (const p of Object.keys(personDrafts)) {
    const c = compositionOf(ownPersons[p] ?? [], personDrafts[p] ?? []);
    if (c.adds.length || c.removes.length) return true;
  }
  return false;
}
