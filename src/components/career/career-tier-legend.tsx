import { cn } from "@/lib/utils";
import { CAREER_TIER_FRAME_CLASS, CAREER_TIER_LABEL, type CareerTier } from "./career-set-tile";

// The key to the gallery's cover frames — shown only for the tiers present
export type CareerTierLegendProps = {
  tiers: CareerTier[];
};

export function CareerTierLegend({ tiers }: CareerTierLegendProps) {
  if (tiers.length < 2) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-label="Frame key">
      {tiers.map((t) => (
        <li key={t} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              "inline-block h-3 w-2.5 rounded-[2px] bg-muted/60",
              t === "pipeline" ? "border border-muted-foreground/40 opacity-60" : cn("outline-offset-1", CAREER_TIER_FRAME_CLASS[t]),
            )}
          />
          {CAREER_TIER_LABEL[t]}
        </li>
      ))}
    </ul>
  );
}
