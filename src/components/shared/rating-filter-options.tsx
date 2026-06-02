// Shared option list for the rating multi-select facet filter used on
// /people and /sets. Stars render in amber (matching the live rating
// widget on the detail pages); "Unrated" stays in the default text
// colour. `label` is the plain-text version (kept for the Command
// search index + clear-all chip fallback); `displayLabel` is the
// styled React node used for both the dropdown options and the
// active filter chips.

type RatingCounts = Record<string, number | undefined>;

export type RatingFilterOption = {
  value: string;
  label: string;
  displayLabel?: React.ReactNode;
  count?: number;
};

function stars(filled: number): string {
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

function StarLabel({ filled }: { filled: number }) {
  return <span className="text-amber-400">{stars(filled)}</span>;
}

export function ratingFilterOptions(counts: RatingCounts): RatingFilterOption[] {
  return [
    { value: "5", label: stars(5), displayLabel: <StarLabel filled={5} />, count: counts[5] },
    { value: "4", label: stars(4), displayLabel: <StarLabel filled={4} />, count: counts[4] },
    { value: "3", label: stars(3), displayLabel: <StarLabel filled={3} />, count: counts[3] },
    { value: "2", label: stars(2), displayLabel: <StarLabel filled={2} />, count: counts[2] },
    { value: "1", label: stars(1), displayLabel: <StarLabel filled={1} />, count: counts[1] },
    { value: "unrated", label: "Unrated", count: counts.unrated },
  ];
}
