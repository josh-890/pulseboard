// Tag naming (2026-10-06 guide, user-guide "Naming tags"): a tag name should be
// unique across the whole catalogue — groups order tags, they do not tell them
// apart, and `#name` files, the query box and the palette all go by name. When a
// value occurs in several dimensions (a colour of nails and of clothes), the tag
// names the thing first: `nailpolish-red`, `outfit-red`. Pure, client-safe.

export type TagNameClash = {
  tagId: string;
  tagName: string;
  groupName: string;
  /** The name equals the tag's own name, or one of its aliases */
  via: "name" | "alias";
};

const TRANSLITERATE: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss", Ä: "ae", Ö: "oe", Ü: "ue" };

/**
 * The one spelling of a tag name (2026-10-06): kebab-case — lower case, `a-z 0-9`,
 * one hyphen per word gap, as on Stack Overflow / GitHub topics. What is shown is
 * what is typed: in the query box (no quotes), as a `#…` file, in the palette.
 * German umlauts transliterate (`nägel` → `naegel`), other accents drop, `&` reads
 * "and". Also the catalogue's slug rule, so a tag's name and slug are the same.
 */
export function toTagName(input: string): string {
  return input
    .trim()
    .replace(/[äöüßÄÖÜ]/g, (c) => TRANSLITERATE[c] ?? c)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Already in the one spelling */
export function isTagName(name: string): boolean {
  return name.length > 0 && name === toTagName(name);
}

/** The catalogue's slug rule — the same as the name rule */
export const tagNameKey = toTagName;

/**
 * A name that says which thing it describes: the group first, then the value —
 * `red` in "Outfit color" becomes `outfit-color-red`.
 */
export function qualifiedTagName(name: string, groupName: string): string {
  return toTagName(`${groupName} ${name}`);
}
