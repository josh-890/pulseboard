import Link from "next/link";
import { formatIntensity, INTENSITY_MAX } from "@/lib/intensity";
import { cn, formatPartialDateISO } from "@/lib/utils";
import type { PersonIntensityData } from "./types";

export type IntensityPeakTilesProps = {
  data: PersonIntensityData;
};

// The peak overall and per scenario, each with the session it came from.
export function IntensityPeakTiles({ data }: IntensityPeakTilesProps) {
  const { summary, scenarios } = data;
  const sessionOf = new Map(summary.sessions.map((s) => [s.sessionId, s]));

  const tile = (key: string, label: string, peak: { value: number; sessionId: string } | null | undefined, main = false) => {
    const s = peak ? sessionOf.get(peak.sessionId) : undefined;
    return (
      <div
        key={key}
        className={cn(
          "w-44 rounded-xl border px-3 py-2",
          main ? "border-primary/40 bg-primary/10" : "border-white/15 bg-card/40",
        )}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("tabular-nums leading-tight", main ? "text-2xl font-bold" : "text-xl font-semibold", peak?.value === INTENSITY_MAX && "text-amber-500")}>
          {peak ? formatIntensity(peak.value) : "—"}
        </p>
        {s && (
          <Link href={`/sessions/${s.sessionId}`} className="block truncate text-[11px] text-muted-foreground hover:text-foreground hover:underline" title={s.sessionName}>
            {s.dated ? formatPartialDateISO(s.date, s.precision) : "undated"} · {s.sessionName}
          </Link>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-wrap gap-2" aria-label="Peaks">
      {tile("all", "Peak", summary.peak, true)}
      {scenarios
        .filter((sc) => sc.acts.length > 0)
        .map((sc) => tile(sc.id, sc.name, summary.scenarioPeaks[sc.id]))}
    </div>
  );
}
