import { Users } from "lucide-react";
import type { MergeDirectionReason } from "@/lib/session-merge-direction";
import { olderBecause, plural } from "@/lib/session-merge-text";
import type { SessionMergeCard } from "@/lib/types";
import { cn, formatPartialDateISO } from "@/lib/utils";

// The facts of both sessions side by side (2026-10-20), the stays-side first:
// what differs is amber, the people on camera in both are green. A person chip
// filters both columns to the photos showing that person.

export type MergeFactsBarProps = {
  survivor: SessionMergeCard;
  absorbed: SessionMergeCard;
  reason: MergeDirectionReason;
  sharedPersonIds: string[];
  personFilter: string | null;
  onPersonFilter: (personId: string | null) => void;
};

function channels(card: SessionMergeCard): string {
  return [...new Set(card.sets.map((s) => s.channelName).filter((c): c is string => !!c))].join(", ");
}

function FactRow({ label, left, right, compare = true }: { label: string; left: string; right: string; compare?: boolean }) {
  const differs = compare && !!left && !!right && left !== right;
  const cell = cn("min-w-0 truncate rounded px-1.5 py-0.5", differs && "bg-amber-500/10 text-amber-800 dark:text-amber-300");
  return (
    <div className="grid grid-cols-[3.75rem_minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-2 text-xs sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)]" data-differs={differs || undefined}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cell} title={left || undefined}>
        {left || <span className="text-muted-foreground">—</span>}
      </dd>
      <dd className={cell} title={right || undefined}>
        {right || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

export function MergeFactsBar({ survivor, absorbed, reason, sharedPersonIds, personFilter, onPersonFilter }: MergeFactsBarProps) {
  const shared = new Set(sharedPersonIds);
  const people = [
    ...survivor.people.filter((p) => shared.has(p.id)).map((p) => ({ ...p, where: "both" as const })),
    ...survivor.people.filter((p) => !shared.has(p.id)).map((p) => ({ ...p, where: "stays" as const })),
    ...absorbed.people.filter((p) => !shared.has(p.id)).map((p) => ({ ...p, where: "goes" as const })),
  ];
  const whereLabel = { both: "in both", stays: "only in the one that stays", goes: "only in the one merged in" };

  return (
    <section aria-label="Facts side by side" className="space-y-3 rounded-xl border border-border bg-card/70 p-3 backdrop-blur-sm">
      <dl className="space-y-1">
        <FactRow
          label="Date"
          left={
            reason === "date"
              ? `${formatPartialDateISO(survivor.date, survivor.datePrecision)} · older`
              : `${formatPartialDateISO(survivor.date, survivor.datePrecision) || "No date"} · ${olderBecause(reason, survivor).replace("Older — ", "older: ")}`
          }
          right={formatPartialDateISO(absorbed.date, absorbed.datePrecision) || "No date"}
          compare={false}
        />
        <FactRow label="Label" left={survivor.labelName ?? ""} right={absorbed.labelName ?? ""} />
        <FactRow label="Project" left={survivor.projectName ?? ""} right={absorbed.projectName ?? ""} />
        <FactRow label="Channel" left={channels(survivor)} right={channels(absorbed)} />
        <FactRow
          label="Content"
          left={`${plural(survivor.sets.length, "set", "sets")} · ${plural(survivor.mediaCount, "photo", "photos")}`}
          right={`${plural(absorbed.sets.length, "set", "sets")} · ${plural(absorbed.mediaCount, "photo", "photos")}`}
          compare={false}
        />
      </dl>

      {people.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users size={12} aria-hidden="true" /> On camera
          </span>
          {people.map((p) => {
            const active = personFilter === p.id;
            return (
              <button
                key={`${p.where}-${p.id}`}
                type="button"
                aria-pressed={active}
                title={`${p.name} — ${whereLabel[p.where]}. ${active ? "Show everyone" : "Show only photos with them"}`}
                onClick={() => onPersonFilter(active ? null : p.id)}
                className={cn(
                  "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  p.where === "both"
                    ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/20 dark:text-emerald-300"
                    : "border-border bg-muted/60 text-foreground/80 hover:bg-muted",
                  active && "ring-2 ring-primary",
                )}
              >
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 text-[10px] opacity-70">{p.where === "both" ? "both" : p.where === "stays" ? "left only" : "right only"}</span>
              </button>
            );
          })}
          {personFilter && (
            <button
              type="button"
              onClick={() => onPersonFilter(null)}
              className="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            >
              Show everyone
            </button>
          )}
        </div>
      )}
    </section>
  );
}
