/** Human-readable labels for DateModifier values */
export const DATE_MODIFIER_LABELS: Record<string, string> = {
  EXACT: "Exact",
  APPROXIMATE: "Approximate",
  ESTIMATED: "Estimated",
  BEFORE: "Before",
  AFTER: "After",
};

/** Prefix symbols shown before formatted dates */
export const DATE_MODIFIER_SYMBOLS: Record<string, string> = {
  EXACT: "",
  APPROXIMATE: "~",
  ESTIMATED: "est. ",
  BEFORE: "before ",
  AFTER: "after ",
};

/** Options for select dropdowns */
export const DATE_MODIFIER_OPTIONS = [
  { value: "EXACT", label: "Exact" },
  { value: "APPROXIMATE", label: "Approximate (~)" },
  { value: "ESTIMATED", label: "Estimated (est.)" },
  { value: "BEFORE", label: "Before" },
  { value: "AFTER", label: "After" },
] as const;
