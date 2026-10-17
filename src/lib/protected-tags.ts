// Tags the app itself depends on (2026-10-17): `iconic` and `outtake` are the
// photo marks (crown and bookmark in the viewer, tiers with ★) and the person
// showcase reads them by slug. They stay ordinary tags for filters and bulk
// tagging, but can't be renamed (the slug follows the name), merged away or
// deleted. Description, sub-tags, group and aliases stay editable.

export const PROTECTED_TAG_SLUGS: readonly string[] = ["iconic", "outtake"];

export const isProtectedTag = (tag: { slug: string }) => PROTECTED_TAG_SLUGS.includes(tag.slug);

export const PROTECTED_TAG_NOTE = "A photo mark — it can't be renamed, merged into another tag or deleted.";
