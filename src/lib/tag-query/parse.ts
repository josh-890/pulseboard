import type { QueryPredicate, TagClause, TagQuery, TagSourceFilter, TagTerm } from "./types";

// Text syntax (ADR-0033), whitespace-separated tokens:
//
//   beach                  bare name — tag name, alias or slug
//   "golden hour"          quotes keep spaces together
//   location:beach         tag `beach` in group `location`
//   location:beach,pool    any of them (one clause)
//   outfit:*               any tag of the group
//   =swimwear              exactly this tag, not its sub-tags
//   -setting:studio        must not match
//   ~pool ~beach           every ~token joins one OR clause
//   @image:close-up        strictly at a level: @image / @set / @session
//   is:fav  rating>=4      predicates: is:fav · is:untagged · has:workflow ·
//                          rating>=N (> < <= =) · person:ICG-ID · persontag:tag ·
//                          label:name · type:photo|video
//
// Prefix order: [-|~] [@level:] [=] reference. Unparseable tokens are reported,
// never silently dropped into a different meaning.

export const PREDICATE_KEYS = new Set(["is", "has", "rating", "person", "persontag", "label", "type"]);

const SOURCES: Record<string, TagSourceFilter> = { image: "image", set: "set", session: "session" };

export type ParseResult = { query: TagQuery; errors: string[] };

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of input) {
    if (ch === '"') {
      quoted = !quoted;
      cur += ch;
    } else if (/\s/.test(ch) && !quoted) {
      if (cur) tokens.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

const unquote = (s: string) => s.replace(/^"(.*)"$/, "$1").replace(/"/g, "");

/** Split at the first ':' that is not inside quotes */
function splitGroup(ref: string): [string, string] | null {
  let quoted = false;
  for (let i = 0; i < ref.length; i++) {
    if (ref[i] === '"') quoted = !quoted;
    else if (ref[i] === ":" && !quoted) return [ref.slice(0, i), ref.slice(i + 1)];
  }
  return null;
}

function parsePredicate(token: string): QueryPredicate | null {
  const m = /^([a-z]+)(>=|<=|>|<|=|:)(.+)$/.exec(token);
  if (!m || !PREDICATE_KEYS.has(m[1])) return null;
  return { key: m[1], op: m[2] as QueryPredicate["op"], value: unquote(m[3]) };
}

export function parseTagQuery(input: string): ParseResult {
  const query: TagQuery = { all: [], none: [], predicates: [] };
  const errors: string[] = [];
  const orClause: TagClause = { any: [] };

  for (const raw of tokenize(input.trim())) {
    let token = raw;
    let mode: "all" | "none" | "or" = "all";
    if (token.startsWith("-")) {
      mode = "none";
      token = token.slice(1);
    } else if (token.startsWith("~")) {
      mode = "or";
      token = token.slice(1);
    }

    if (mode === "all") {
      const predicate = parsePredicate(token);
      if (predicate) {
        query.predicates.push(predicate);
        continue;
      }
    }

    let source: TagSourceFilter = "any";
    let exact = false;
    const src = /^@([a-z]+):(.*)$/.exec(token);
    if (src) {
      const s = SOURCES[src[1]];
      if (!s) {
        errors.push(`Unknown level "@${src[1]}" in ${raw} — use @image, @set or @session`);
        continue;
      }
      source = s;
      token = src[2];
    }
    if (token.startsWith("=")) {
      exact = true;
      token = token.slice(1);
    }
    if (!token) {
      errors.push(`Nothing to match in "${raw}"`);
      continue;
    }

    const split = splitGroup(token);
    let terms: TagTerm[];
    if (split) {
      const [group, rest] = split;
      const names = rest.split(",").map((t) => unquote(t).trim()).filter(Boolean);
      if (!group || names.length === 0) {
        errors.push(`Incomplete tag "${raw}"`);
        continue;
      }
      terms = names.map((tag) => ({ group: unquote(group).toLowerCase(), tag: tag === "*" ? "*" : tag.toLowerCase(), exact, source }));
    } else {
      terms = [{ group: null, tag: unquote(token).toLowerCase(), exact, source }];
    }

    if (mode === "none") query.none.push(...terms);
    else if (mode === "or") orClause.any.push(...terms);
    else query.all.push({ any: terms });
  }

  if (orClause.any.length > 0) query.all.push(orClause);
  return { query, errors };
}
