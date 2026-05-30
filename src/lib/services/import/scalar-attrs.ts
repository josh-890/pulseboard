// Canonical list of physical-attribute catalog slugs surfaced by the import
// workflow. Driven from one place so the new-person comparison grid and the
// re-import diff cannot drift apart (the former renders source-vs-baseline
// rows; the latter computes per-row Accept/Decline decisions).
//
// `parserKey` names the field on ParsedPersonData that feeds the slug. Slugs
// without a parserKey today are still listed so the re-import diff can detect
// DB-side values that no current parser produces (the row is just hidden in
// the new-person grid). Per `project_slug_naming_inconsistency.md` slugs are
// mixed snake/kebab — preserve verbatim, defer the rename to its own slice.

export type ImportScalarAttr = {
  slug: string;
  name: string;
  parserKey?: string;
  // ADR-0007 / project_status_bearing_eligibility.md: only breast_size is
  // statusBearing today. Drives the Natural/Enhanced/Restored pill on the
  // baseline value in the grid.
  statusBearing?: boolean;
};

export const IMPORT_SCALAR_ATTRS: ImportScalarAttr[] = [
  { slug: "hair_color", name: "Hair Color", parserKey: "hairColor" },
  { slug: "weight", name: "Weight" },
  { slug: "build", name: "Build" },
  {
    slug: "breast_size",
    name: "Breast Size",
    parserKey: "breastDescription",
    statusBearing: true,
  },
  { slug: "hair-length", name: "Hair Length" },
  { slug: "eye-color", name: "Eye Color" },
  { slug: "height", name: "Height" },
  { slug: "ethnicity-broad", name: "Ethnicity (Broad)" },
  { slug: "ethnicity-specific", name: "Ethnicity (Specific)" },
  { slug: "measurements", name: "Measurements", parserKey: "measurements" },
];
