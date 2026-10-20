import type { MergeDirectionReason } from "@/lib/session-merge-direction";
import type { SessionMergeCard } from "@/lib/types";
import { formatPartialDateISO } from "@/lib/utils";

// The words of a session merge (2026-10-18), shared by the finder dialog and the
// compare page: why one session is the older, and what the merged one will hold.

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function olderBecause(reason: MergeDirectionReason, card: SessionMergeCard): string {
  if (reason === "date") return `Older — session date ${formatPartialDateISO(card.date, card.datePrecision)}`;
  if (reason === "set-release") {
    const first = card.sets.find((s) => s.releaseDate);
    return `Older — first set released ${formatPartialDateISO(card.earliestRelease, first?.releaseDatePrecision ?? "DAY")}`;
  }
  return "Older — created first";
}

/** What the surviving session holds after the merge */
export function afterwards(a: SessionMergeCard, b: SessionMergeCard): string {
  const people = new Set([...a.people, ...b.people].map((p) => p.id)).size;
  const sets = new Set([...a.sets, ...b.sets].map((s) => s.id)).size;
  return [plural(a.mediaCount + b.mediaCount, "photo", "photos"), plural(people, "person", "people"), plural(sets, "set", "sets")].join(" · ");
}
