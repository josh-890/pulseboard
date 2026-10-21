"use client";

import { Check, Minus } from "lucide-react";
import { formatIntensity } from "@/lib/intensity";
import { cn } from "@/lib/utils";

/** A ticked act of one person in the session — what a photo can be evidence for (ADR-0036, 3b) */
export type EvidenceAct = {
  /** The ContributionAct */
  id: string;
  contributionId: string;
  /** `Name (ICG-ID)` */
  personLabel: string;
  actName: string;
  scenarioName: string;
  level: number;
};

export type EvidenceState = "all" | "some" | "none";

export type ActEvidenceListProps = {
  acts: EvidenceAct[];
  /** Whether the photos in hand are linked to this act: all, some or none of them */
  stateOf: (contributionActId: string) => EvidenceState;
  /** Link (true) or unlink every photo in hand */
  onToggle: (contributionActId: string, linked: boolean) => void;
  /** The lightbox is always dark */
  dark?: boolean;
};

// The acts a photo can show, grouped by person: each ticked act of each person
// on camera here. Ticking links the photos in hand; a half tick (−) says only
// some of them are linked, and ticking it links the rest. Acts not ticked for
// a person are not offered — no evidence without a tick.
export function ActEvidenceList({ acts, stateOf, onToggle, dark }: ActEvidenceListProps) {
  if (acts.length === 0) {
    return (
      <p className={cn("px-1 py-2 text-xs", dark ? "text-white/60" : "text-muted-foreground")}>
        No acts ticked in this session yet — tick them in the Intensity panel first.
      </p>
    );
  }
  const people = [...new Map(acts.map((a) => [a.contributionId, a.personLabel])).entries()];
  return (
    <div className="max-h-80 space-y-2 overflow-y-auto">
      {people.map(([cid, label]) => (
        <div key={cid} role="group" aria-label={label}>
          <p className={cn("px-1 pb-0.5 text-[11px] font-medium", dark ? "text-white/50" : "text-muted-foreground")}>{label}</p>
          <ul>
            {acts
              .filter((a) => a.contributionId === cid)
              .map((a) => {
                const st = stateOf(a.id);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={st === "all" ? true : st === "some" ? "mixed" : false}
                      aria-label={`${a.actName} — ${label}`}
                      onClick={() => onToggle(a.id, st !== "all")}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2",
                        dark ? "text-white/85 hover:bg-white/10 focus-visible:ring-white/50" : "hover:bg-muted focus-visible:ring-ring",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border",
                          st === "none" ? (dark ? "border-white/40" : "border-muted-foreground/60") : "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {st === "all" && <Check size={12} />}
                        {st === "some" && <Minus size={12} />}
                      </span>
                      <span className={cn("w-7 shrink-0 text-right text-xs tabular-nums", dark ? "text-white/50" : "text-muted-foreground")}>
                        {formatIntensity(a.level)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{a.actName}</span>
                      <span className={cn("shrink-0 text-[10px]", dark ? "text-white/40" : "text-muted-foreground")}>{a.scenarioName}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}
