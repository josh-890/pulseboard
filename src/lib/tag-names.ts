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

/** The catalogue's slug rule (tag-service `slugify`) */
export function tagNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * A name that says which thing it describes: the group first, then the value.
 * Follows the style the name is written in — `red` in "Outfit color" becomes
 * `outfit-color-red`, `Red` becomes `Outfit color Red`.
 */
export function qualifiedTagName(name: string, groupName: string): string {
  const trimmed = name.trim();
  if (/^[a-z0-9-]+$/.test(trimmed)) return tagNameKey(`${groupName} ${trimmed}`);
  return `${groupName.trim()} ${trimmed}`;
}
