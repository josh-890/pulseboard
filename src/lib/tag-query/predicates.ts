import type { TaggableEntity } from "@/lib/tag-domains";
import type { QueryPredicate, ResolvedPredicate } from "./types";

// Which predicate applies to which browser, and how predicates read on chips
// and in the query box's suggestions (ADR-0033, S5). Pure — shared by the
// server (resolution) and the client (chips, autocomplete).

export const PREDICATE_SUPPORT: Record<ResolvedPredicate["kind"], TaggableEntity[]> = {
  fav: ["MEDIA_ITEM", "PERSON"],
  untagged: ["MEDIA_ITEM", "SET", "SESSION", "PERSON", "PROJECT"],
  workflow: ["MEDIA_ITEM", "SET", "SESSION", "PERSON", "PROJECT"],
  rating: ["SET", "PERSON"],
  person: ["MEDIA_ITEM", "SET", "SESSION", "PERSON"],
  persontag: ["MEDIA_ITEM", "SET", "SESSION"],
  label: ["MEDIA_ITEM", "SET", "SESSION"],
  type: ["MEDIA_ITEM", "SET"],
};

/** Completions the query box offers for predicates, per browser */
export function predicateSuggestions(entity: TaggableEntity): { insert: string; hint: string }[] {
  const all: { kind: ResolvedPredicate["kind"]; insert: string; hint: string }[] = [
    { kind: "fav", insert: "is:fav", hint: "favorites" },
    { kind: "untagged", insert: "is:untagged", hint: "no own tags" },
    { kind: "workflow", insert: "has:workflow", hint: "has a to-do tag" },
    { kind: "rating", insert: "rating>=", hint: "rating ≥ N (also > < <= =)" },
    { kind: "person", insert: "person:", hint: "ICG-ID — shows / has this person" },
    { kind: "persontag", insert: "persontag:", hint: "cast carries a person tag" },
    { kind: "label", insert: "label:", hint: "label name" },
    { kind: "type", insert: "type:photo", hint: "photos" },
    { kind: "type", insert: "type:video", hint: "videos" },
  ];
  return all.filter((s) => PREDICATE_SUPPORT[s.kind].includes(entity)).map(({ insert, hint }) => ({ insert, hint }));
}

const OP_TEXT: Record<string, string> = { ">=": "≥", "<=": "≤", ">": ">", "<": "<", "=": "=", ":": "=" };

/** Chip text for a predicate as written */
export function predicateLabel(p: QueryPredicate): string {
  const v = p.value;
  switch (p.key) {
    case "is":
      return v.toLowerCase() === "untagged" ? "Untagged" : /^fav/i.test(v) ? "Favorite" : `is ${v}`;
    case "has":
      return v.toLowerCase() === "workflow" ? "Has a to-do" : `has ${v}`;
    case "rating":
      return `Rating ${OP_TEXT[p.op] ?? p.op} ${v}`;
    case "person":
      return `Person ${v}`;
    case "persontag":
      return `Person tagged ${v}`;
    case "label":
      return `Label ${v}`;
    case "type":
      return v.toLowerCase() === "video" ? "Videos" : v.toLowerCase() === "photo" ? "Photos" : `type ${v}`;
    default:
      return `${p.key}${p.op}${v}`;
  }
}
