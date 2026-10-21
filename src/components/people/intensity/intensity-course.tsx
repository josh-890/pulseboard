"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { IntensityHoverText } from "@/components/intensity/intensity-hover-text";
import { formatIntensity, INTENSITY_MAX } from "@/lib/intensity";
import { cn, formatPartialDateISO } from "@/lib/utils";
import type { PersonIntensityData } from "./types";

export type IntensityCourseProps = {
  data: PersonIntensityData;
};

// Session by session, oldest first: a bar per session to its intensity, a star
// where an act came for the first time. Undated sessions follow, set apart.
// Each bar opens its session; hovering lists its acts.
export function IntensityCourse({ data }: IntensityCourseProps) {
  const { summary, scenarios } = data;
  const actName = new Map(scenarios.flatMap((sc) => sc.acts.map((a) => [a.id, a.name] as const)));
  const dated = summary.sessions.filter((s) => s.dated);
  const undated = summary.sessions.filter((s) => !s.dated);

  const bar = (s: (typeof summary.sessions)[number]) => {
    const pct = s.value === null ? 0 : (s.value / INTENSITY_MAX) * 100;
    const acts = [...s.acts].sort((a, b) => b.value - a.value);
    const hover = [
      `${s.sessionName} — ${s.dated ? formatPartialDateISO(s.date, s.precision) : "undated"}`,
      ...acts.map((a) => `${actName.get(a.actId) ?? "?"} ${formatIntensity(a.value)}${s.firsts.includes(a.actId) ? " ★ first time" : ""}`),
    ].join("\n");
    return (
      <li key={s.sessionId} className="w-11 shrink-0">
        <IntensityHoverText side="top" text={hover} className="block">
          <Link
            href={`/sessions/${s.sessionId}`}
            aria-label={`${s.sessionName}: ${s.value === null ? "no value" : formatIntensity(s.value)}${s.firsts.length ? `, ${s.firsts.length} first` : ""}`}
            className="group flex flex-col items-center gap-1 rounded-md px-0.5 py-1 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-4 items-center text-amber-500">
              {s.firsts.length > 0 && <Star size={12} fill="currentColor" aria-hidden="true" />}
            </span>
            <span className="text-[11px] font-semibold tabular-nums">{s.value === null ? "—" : formatIntensity(s.value)}</span>
            <span className="relative flex h-24 w-4 items-end overflow-hidden rounded-sm bg-muted/40">
              <span
                className={cn("w-full rounded-sm transition-colors", s.value === INTENSITY_MAX ? "bg-amber-500" : "bg-primary/80 group-hover:bg-primary")}
                style={{ height: `${pct}%` }}
              />
            </span>
            <DateLabel date={s.date} precision={s.precision} dated={s.dated} />
          </Link>
        </IntensityHoverText>
      </li>
    );
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/15 bg-card/40 p-2">
      <ol className="flex items-end gap-1" aria-label="Intensity by session, oldest first">
        {dated.map(bar)}
        {undated.length > 0 && (
          <li className="mx-1 flex h-full shrink-0 flex-col items-center self-stretch">
            <span className="h-full w-px bg-white/20" aria-hidden="true" />
            <span className="mt-1 text-[10px] text-muted-foreground">undated</span>
          </li>
        )}
        {undated.map(bar)}
      </ol>
    </div>
  );
}

// Year on top, the rest (month, day) beneath — fits a narrow bar
function DateLabel({ date, precision, dated }: { date: Date | null; precision: string; dated: boolean }) {
  if (!dated) return <span className="text-[10px] text-muted-foreground">—</span>;
  const [year, ...rest] = formatPartialDateISO(date, precision).split("-");
  return (
    <span className="flex flex-col items-center text-[10px] leading-tight tabular-nums text-muted-foreground">
      <span className="font-medium text-foreground/80">{year}</span>
      <span>{rest.length ? rest.join("-") : "\u00a0"}</span>
    </span>
  );
}
