"use client";

import Link from "next/link";
import { IntensityHoverText } from "@/components/intensity/intensity-hover-text";
import { formatIntensity } from "@/lib/intensity";
import { cn, formatPartialDateISO } from "@/lib/utils";
import type { PersonIntensityData } from "./types";

export type IntensityMatrixViewProps = {
  data: PersonIntensityData;
};

// The catalog as this person filled it: rows are levels that hold acts, the
// first column the scale's titles; an act reached is filled, with the date it
// first came (a link to that session) and in how many sessions.
export function IntensityMatrixView({ data }: IntensityMatrixViewProps) {
  const { summary, scale, scenarios } = data;
  const shown = scenarios.filter((sc) => sc.acts.length > 0);
  const levels = [...new Set(shown.flatMap((sc) => sc.acts.map((a) => a.level)))].sort((a, b) => a - b);
  const steps = new Map(scale.map((s) => [s.value, s]));
  const sessionName = new Map(summary.sessions.map((s) => [s.sessionId, s.sessionName]));

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/15 bg-card/40">
      <div role="table" aria-label="Intensity matrix" className="w-max min-w-full text-sm">
        <div role="row" className="flex border-b border-white/15">
          <div role="columnheader" className="sticky left-0 z-10 w-44 shrink-0 bg-card px-3 py-1.5 text-xs font-semibold">
            Level
          </div>
          {shown.map((sc) => (
            <div key={sc.id} role="columnheader" className="w-52 shrink-0 px-2 py-1.5 text-xs font-semibold">
              {sc.name}
            </div>
          ))}
        </div>
        {levels.map((level) => {
          const step = steps.get(level);
          return (
            <div key={level} role="row" className="flex border-b border-white/10 last:border-b-0">
              <div role="rowheader" className="sticky left-0 z-10 flex w-44 shrink-0 items-start gap-2 bg-card px-3 py-1.5">
                <span className="w-8 shrink-0 text-right font-semibold tabular-nums">{formatIntensity(level)}</span>
                <IntensityHoverText side="right" text={step?.description ?? null} className="min-w-0">
                  <span className="text-xs text-muted-foreground">{step?.title ?? ""}</span>
                </IntensityHoverText>
              </div>
              {shown.map((sc) => (
                <div key={sc.id} role="cell" className="w-52 shrink-0 space-y-1 px-2 py-1.5">
                  {sc.acts
                    .filter((a) => a.level === level)
                    .map((a) => {
                      const r = summary.reached[a.id];
                      const when = r?.first ? formatPartialDateISO(r.first.date, r.first.precision) : r ? "date unknown" : null;
                      const hover = [
                        a.description,
                        r?.first ? `First: ${sessionName.get(r.first.sessionId) ?? ""} (${when})` : null,
                        r ? `In ${r.count} ${r.count === 1 ? "session" : "sessions"}` : "Not yet",
                      ]
                        .filter(Boolean)
                        .join("\n");
                      const body = (
                        <span
                          className={cn(
                            "flex items-baseline justify-between gap-2 rounded-md px-1.5 py-0.5 text-xs",
                            r ? "bg-primary/15 font-medium text-foreground" : "border border-dashed border-white/15 text-muted-foreground/70",
                          )}
                          aria-label={r ? `${a.name}: reached, first ${when}, ${r.count} ${r.count === 1 ? "session" : "sessions"}` : `${a.name}: not reached`}
                        >
                          <span className="min-w-0 truncate">{a.name}</span>
                          {r && (
                            <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                              {when} · {r.count}
                            </span>
                          )}
                        </span>
                      );
                      return (
                        <IntensityHoverText key={a.id} side="top" text={hover} className="block">
                          {r?.first ? (
                            <Link href={`/sessions/${r.first.sessionId}`} className="block rounded-md hover:ring-1 hover:ring-primary/50">
                              {body}
                            </Link>
                          ) : (
                            body
                          )}
                        </IntensityHoverText>
                      );
                    })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
