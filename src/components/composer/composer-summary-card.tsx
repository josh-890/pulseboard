import Link from "next/link";
import { Shapes } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComposerSummary } from "@/lib/services/composer-summary-service";
import { pathStyle } from "./composer-path-style";

export type ComposerSummaryCardProps = {
  summary: ComposerSummary;
  /** The set page, for gallery filter links (`?tags=`) */
  setHref: string;
  composeHref: string;
};

/**
 * The set as its photos are tagged (ADR-0042, S5) — computed, never stored on
 * the set: per Composer path how many photos are tagged there, and the tags
 * they carry with counts ("high-heels 40"). A tag filters the gallery to the
 * photos carrying it.
 */
export function ComposerSummaryCard({ summary, setHref, composeHref }: ComposerSummaryCardProps) {
  const { total, tagged, paths } = summary;
  return (
    <div className="rounded-2xl border border-white/20 bg-card/70 p-4 shadow-md backdrop-blur-sm" data-testid="composer-summary">
      <div className="mb-3 flex items-center gap-2">
        <Shapes size={14} className="text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold">Composer</h2>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {tagged} / {total} photos
        </span>
      </div>
      {tagged === 0 ? (
        <p className="text-xs text-muted-foreground">
          No photo tagged yet.{" "}
          <Link href={composeHref} className="text-primary hover:underline">
            Open the workbench
          </Link>
        </p>
      ) : (
        <ul className="space-y-3">
          {paths.map((p) => {
            const s = pathStyle(p.name);
            const share = total > 0 ? p.tagged / total : 0;
            return (
              <li key={p.id} data-path={p.name}>
                <div className="flex items-center gap-2 text-xs">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", s.dot)} aria-hidden />
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    {p.tagged}/{total}
                  </span>
                </div>
                <div
                  className="mt-1 h-1 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={`${p.name}: ${p.tagged} of ${total} photos tagged`}
                >
                  <div className={cn("h-full rounded-full", s.dot)} style={{ width: `${share * 100}%` }} />
                </div>
                {p.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {p.tags.map((t) => (
                      <Link
                        key={t.id}
                        href={`${setHref}?tags=${encodeURIComponent(`@image:${t.name}`)}`}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition-colors hover:bg-muted",
                          "border-border/60",
                        )}
                        title={`${t.name}: ${t.count} of ${total} photos — show them`}
                      >
                        {t.name}
                        <span className="tabular-nums text-muted-foreground">{t.count}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link href={composeHref} className="mt-3 inline-block text-xs text-primary hover:underline">
        Open the workbench →
      </Link>
    </div>
  );
}
