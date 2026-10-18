import { CalendarClock, FolderKanban, Tag, Users } from "lucide-react";
import type { SessionMergeReason } from "@/lib/types";

// Why a session is suggested for a merge (2026-10-18): the people, label and
// project it shares with this one, and how close their sets were released.

export type MergeReasonChipsProps = { reasons: SessionMergeReason[] };

const CHIP = "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4";
const STRONG = "border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300";
const SOFT = "border-border bg-muted/60 text-muted-foreground";

function daysLabel(days: number): string {
  if (days === 0) return "Released the same day";
  if (days === 1) return "Released 1 day apart";
  return `Released ${days} days apart`;
}

export function MergeReasonChips({ reasons }: MergeReasonChipsProps) {
  if (reasons.length === 0) return null;
  return (
    <ul aria-label="Why it is suggested" className="flex flex-wrap gap-1">
      {reasons.map((r) => {
        switch (r.kind) {
          case "people":
            return (
              <li key="people" className={`${CHIP} ${STRONG}`} title={r.names.join(", ")}>
                <Users size={11} aria-hidden="true" className="shrink-0" />
                <span className="truncate">
                  {r.names.length === 1 ? `Same person: ${r.names[0]}` : `${r.names.length} same people`}
                </span>
              </li>
            );
          case "label":
            return (
              <li key="label" className={`${CHIP} ${STRONG}`}>
                <Tag size={11} aria-hidden="true" className="shrink-0" />
                <span className="truncate">Same label: {r.name}</span>
              </li>
            );
          case "project":
            return (
              <li key="project" className={`${CHIP} ${SOFT}`}>
                <FolderKanban size={11} aria-hidden="true" className="shrink-0" />
                <span className="truncate">Same project: {r.name}</span>
              </li>
            );
          case "close":
            return (
              <li key="close" className={`${CHIP} ${SOFT}`}>
                <CalendarClock size={11} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{daysLabel(r.days)}</span>
              </li>
            );
        }
      })}
    </ul>
  );
}
