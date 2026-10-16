import { cn } from "@/lib/utils";
import type { ShowcaseSource } from "@/lib/services/person-showcase-service";

// Where a showcase photo comes from — shown on curated photos only
const SOURCE_CHIP: Record<Exclude<ShowcaseSource, "random">, { label: string; className: string }> = {
  iconic: { label: "Iconic", className: "bg-amber-400/90 text-amber-950" },
  favorite: { label: "★ Favorite", className: "bg-yellow-300/90 text-yellow-950" },
  outtake: { label: "Outtake", className: "bg-violet-500/85 text-white" },
};

export type ShowcaseSourceChipProps = {
  source: ShowcaseSource;
  className?: string;
};

export function ShowcaseSourceChip({ source, className }: ShowcaseSourceChipProps) {
  if (source === "random") return null;
  const chip = SOURCE_CHIP[source];
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm backdrop-blur-sm",
        chip.className,
        className,
      )}
    >
      {chip.label}
    </span>
  );
}
