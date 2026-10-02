import type { QueryPredicate, TagClause, TagQuery, TagTerm } from "./types";

// Canonical text for a TagQuery — the inverse of `parseTagQuery`, used for the
// `tags=` URL parameter and saved filters. A clause whose terms share group,
// level and exactness collapses to `group:a,b`; any other clause is written
// as `~` tokens (the syntax holds one such mixed clause).

const needsQuotes = (s: string) => /[\s":,]/.test(s);
const q = (s: string) => (needsQuotes(s) ? `"${s.replace(/"/g, "")}"` : s);

function prefix(t: Pick<TagTerm, "source" | "exact">): string {
  return `${t.source === "any" ? "" : `@${t.source}:`}${t.exact ? "=" : ""}`;
}

function ref(t: TagTerm): string {
  return t.group ? `${q(t.group)}:${t.tag === "*" ? "*" : q(t.tag)}` : q(t.tag);
}

export function serializeTerm(t: TagTerm): string {
  return `${prefix(t)}${ref(t)}`;
}

function serializeClause(c: TagClause): string {
  const [first] = c.any;
  const homogeneous =
    !!first &&
    first.group !== null &&
    c.any.every((t) => t.group === first.group && t.source === first.source && t.exact === first.exact);
  if (homogeneous) {
    return `${prefix(first)}${q(first.group as string)}:${c.any.map((t) => (t.tag === "*" ? "*" : q(t.tag))).join(",")}`;
  }
  if (c.any.length === 1) return serializeTerm(first);
  return c.any.map((t) => `~${serializeTerm(t)}`).join(" ");
}

function serializePredicate(p: QueryPredicate): string {
  return `${p.key}${p.op}${q(p.value)}`;
}

export function serializeTagQuery(query: TagQuery): string {
  return [
    ...query.all.map(serializeClause),
    ...query.none.map((t) => `-${serializeTerm(t)}`),
    ...query.predicates.map(serializePredicate),
  ].join(" ");
}
