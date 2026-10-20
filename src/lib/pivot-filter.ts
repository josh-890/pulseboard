// Pivot filters (2026-10-20): a value seen on a gallery card — a person, a channel
// or label, a part of a date — filters the gallery by that value. A click refines:
// it joins the active filters, replaces a value of the same kind, and takes the
// value away when it is the one already active. The URL is the filter state, so
// this is all about search params.

export type PivotFacet =
  /** The person filter holds one person; the name rides along for the chip */
  | { kind: "person"; id: string; display: string }
  /** A comma-list param (channel, label) narrowed to this one value */
  | { kind: "value"; param: string; value: string }
  /** A date range set to one year, month or day: from = to = value */
  | { kind: "date"; from: string; to: string; value: string };

/** Params that only page through the current result — dropped by a new filter */
const PAGING_PARAMS = ["loaded"];

export function isPivotActive(params: URLSearchParams, facet: PivotFacet): boolean {
  switch (facet.kind) {
    case "person":
      return params.get("personId") === facet.id;
    case "value": {
      const values = (params.get(facet.param) ?? "").split(",").filter(Boolean);
      return values.length === 1 && values[0] === facet.value;
    }
    case "date":
      return params.get(facet.from) === facet.value && params.get(facet.to) === facet.value;
  }
}

/** The search params after a click on `facet` — the input is left as it was */
export function applyPivot(current: URLSearchParams, facet: PivotFacet): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const p of PAGING_PARAMS) next.delete(p);
  const off = isPivotActive(current, facet);
  switch (facet.kind) {
    case "person":
      if (off) {
        next.delete("personId");
        next.delete("personName");
      } else {
        next.set("personId", facet.id);
        next.set("personName", facet.display);
      }
      break;
    case "value":
      if (off) next.delete(facet.param);
      else next.set(facet.param, facet.value);
      break;
    case "date":
      if (off) {
        next.delete(facet.from);
        next.delete(facet.to);
      } else {
        next.set(facet.from, facet.value);
        next.set(facet.to, facet.value);
      }
      break;
  }
  return next;
}

export type DatePivotPart = {
  /** As shown: "2016", "08", "15" */
  text: string;
  /** The filter value: "2016", "2016-08", "2016-08-15" */
  value: string;
  /** Spoken / tooltip: "2016", "Aug 2016", "15 Aug 2016" */
  title: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The clickable parts of a date as `formatPartialDateISO` shows it — year only
 * without a precision or with YEAR, year and month with MONTH, all three otherwise.
 */
export function datePivotParts(date: Date | null | undefined, precision: string | null | undefined): DatePivotPart[] {
  if (!date) return [];
  const y = String(date.getUTCFullYear());
  const monthIdx = date.getUTCMonth();
  const m = String(monthIdx + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const parts: DatePivotPart[] = [{ text: y, value: y, title: y }];
  if (!precision || precision === "YEAR") return parts;
  parts.push({ text: m, value: `${y}-${m}`, title: `${MONTHS[monthIdx]} ${y}` });
  if (precision === "MONTH") return parts;
  parts.push({ text: d, value: `${y}-${m}-${d}`, title: `${Number(d)} ${MONTHS[monthIdx]} ${y}` });
  return parts;
}
