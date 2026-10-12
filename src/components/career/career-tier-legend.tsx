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
              "inline-block h-4 w-3 rounded-[2px] bg-muted/60",
              CAREER_TIER_FRAME_CLASS[t]
                ? cn("outline-offset-1", CAREER_TIER_FRAME_CLASS[t])
                : cn("border border-muted-foreground/40", t === "pipeline" && "opacity-60"),
            )}
          />
          {CAREER_TIER_LABEL[t]}
        </li>
      ))}
    </ul>
  );
}
