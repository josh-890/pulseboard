import { tokenize } from "./parse";
import { q as quote } from "./serialize";

// A catalog name changed — an act or a scenario of the intensity catalog
// (ADR-0036). Saved queries name them in text (`act:Name`, `act:Scenario/Name`,
// `intensity:Scenario>=5`), so the rename rewrites those tokens and leaves the
// rest of the text as typed. Names compare case-insensitively, like the resolver.

export type CatalogRename =
  /** An act in `scenario` renamed; `nameStaysTaken` — another act still has the old name, so a bare `act:Old` keeps meaning it */
  | { kind: "act"; scenario: string; from: string; to: string; nameStaysTaken: boolean }
  | { kind: "scenario"; from: string; to: string };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function rewriteAct(value: string, r: CatalogRename): string | null {
  const slash = value.indexOf("/");
  if (r.kind === "act") {
    if (same(value, r.from)) return r.nameStaysTaken ? null : r.to;
    if (slash > 0 && same(value.slice(0, slash), r.scenario) && same(value.slice(slash + 1), r.from)) {
      return `${value.slice(0, slash)}/${r.to}`;
    }
    return null;
  }
  if (slash > 0 && same(value.slice(0, slash), r.from)) return `${r.to}/${value.slice(slash + 1)}`;
  return null;
}

function rewriteIntensity(value: string, r: CatalogRename): string | null {
  if (r.kind !== "scenario") return null;
  const m = /^(.*?)(>=|<=|>|<|=)(.*)$/.exec(value);
  if (!m || !m[1].trim() || !same(m[1], r.from)) return null;
  return `${r.to}${m[2]}${m[3]}`;
}

/** The query text with the renamed act or scenario, or the same text when nothing named it */
export function renameInTagQuery(text: string, rename: CatalogRename): string {
  let changed = false;
  const tokens = tokenize(text.trim()).map((token) => {
    const m = /^(act|intensity):(.+)$/.exec(token);
    if (!m) return token;
    const value = m[2].replace(/^"(.*)"$/, "$1").replace(/"/g, "");
    const next = m[1] === "act" ? rewriteAct(value, rename) : rewriteIntensity(value, rename);
    if (next === null) return token;
    changed = true;
    return `${m[1]}:${quote(next)}`;
  });
  return changed ? tokens.join(" ") : text;
}
