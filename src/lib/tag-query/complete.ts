import type { TaggableEntity } from "@/lib/tag-domains";
import { predicateSuggestions } from "./predicates";

// Query-box autocomplete (ADR-0033, S5). Pure: finds the token at the caret,
// proposes completions (groups, tags, levels, predicates) and splices the
// chosen one in, keeping the token's prefix (- ~ @level: =).

export type CompletionGroup = {
  slug: string;
  name: string;
  color: string;
  tags: { slug: string; name: string }[];
};

export type Completion = {
  /** Text replacing the token's core */
  insert: string;
  label: string;
  hint?: string;
  color?: string;
};

const LEVELS: Record<TaggableEntity, string[]> = {
  MEDIA_ITEM: ["image", "set", "session"],
  SET: ["set", "session"],
  SESSION: [],
  PERSON: [],
  PROJECT: [],
};

const PREDICATE_VALUES: Record<string, string[]> = {
  is: ["fav", "untagged"],
  has: ["workflow"],
  type: ["photo", "video"],
};

export type TokenAtCaret = {
  /** Where the token starts / ends in the text */
  start: number;
  end: number;
  /** Prefix kept on completion: `-`, `~`, `@set:`, `=` … */
  prefix: string;
  /** What is being completed */
  core: string;
};

export function tokenAtCaret(text: string, caret: number): TokenAtCaret {
  let start = caret;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  let end = caret;
  while (end < text.length && !/\s/.test(text[end])) end++;
  const token = text.slice(start, caret);
  const m = /^([-~]?)(@[a-z]+:)?(=?)(.*)$/.exec(token) ?? ["", "", "", "", token];
  return { start, end, prefix: `${m[1]}${m[2] ?? ""}${m[3]}`, core: m[4] };
}

export function completionsFor(
  core: string,
  prefix: string,
  groups: CompletionGroup[],
  entity: TaggableEntity,
  limit = 8,
): Completion[] {
  const q = core.toLowerCase();
  const out: Completion[] = [];

  // A lone "@" (or "@se") → levels
  if (q.startsWith("@") && !prefix.includes("@")) {
    for (const l of LEVELS[entity]) {
      if (`@${l}:`.startsWith(q)) out.push({ insert: `@${l}:`, label: `@${l}:`, hint: `strictly on the ${l === "image" ? "image" : `${l}`}` });
    }
    return out.slice(0, limit);
  }

  const colon = q.indexOf(":");
  if (colon >= 0) {
    const key = q.slice(0, colon);
    const rest = q.slice(colon + 1);
    const values = PREDICATE_VALUES[key];
    if (values && !prefix) {
      return values
        .filter((v) => v.startsWith(rest))
        .map((v) => ({ insert: `${key}:${v}`, label: `${key}:${v}` }))
        .slice(0, limit);
    }
    const g = groups.find((x) => x.slug === key);
    if (!g) return [];
    const tags = g.tags.filter((t) => t.slug.startsWith(rest) || t.name.toLowerCase().includes(rest));
    return [
      ...(rest === "" ? [{ insert: `${g.slug}:*`, label: `${g.slug}:*`, hint: `any ${g.name} tag`, color: g.color }] : []),
      ...tags.map((t) => ({ insert: `${g.slug}:${t.slug}`, label: t.name, hint: g.name, color: g.color })),
    ].slice(0, limit);
  }

  if (q === "") return [];

  // Predicates (not after - ~ = or a level)
  if (!prefix) {
    for (const p of predicateSuggestions(entity)) {
      if (p.insert.startsWith(q)) out.push({ insert: p.insert, label: p.insert, hint: p.hint });
    }
  }
  // Groups as `slug:`
  for (const g of groups) {
    if (g.slug.startsWith(q) || g.name.toLowerCase().startsWith(q)) {
      out.push({ insert: `${g.slug}:`, label: `${g.slug}:`, hint: `${g.name} group`, color: g.color });
    }
  }
  // Tags as `group:tag`, name prefix matches first
  const tagHits: (Completion & { rank: number })[] = [];
  for (const g of groups) {
    for (const t of g.tags) {
      const name = t.name.toLowerCase();
      const rank = name.startsWith(q) || t.slug.startsWith(q) ? 0 : name.includes(q) ? 1 : -1;
      if (rank >= 0) tagHits.push({ insert: `${g.slug}:${t.slug}`, label: t.name, hint: g.name, color: g.color, rank });
    }
  }
  tagHits.sort((a, b) => a.rank - b.rank);
  out.push(...tagHits.map(({ rank: _rank, ...c }) => c));
  return out.slice(0, limit);
}

/** Splice a completion into the text; returns the new text and caret */
export function applyCompletion(text: string, token: TokenAtCaret, c: Completion): { text: string; caret: number } {
  const open = /[:=<>]$/.test(c.insert);
  const replacement = `${token.prefix}${c.insert}${open ? "" : " "}`;
  const after = text.slice(token.end).replace(/^\s+/, "");
  const next = `${text.slice(0, token.start)}${replacement}${after}`;
  return { text: next, caret: token.start + replacement.length };
}
