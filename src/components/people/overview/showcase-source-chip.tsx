import { cn } from "@/lib/utils";
import { MARK_BY_KEY } from "@/components/gallery/media-marks";
import type { ShowcaseSource } from "@/lib/services/person-showcase-service";

// Where a showcase photo comes from — the photo's mark, with the same icon and
// colour as on tiles and in the lightbox. Nothing for random photos.

export type ShowcaseSourceChipProps = {
  source: ShowcaseSource;
  className?: string;
};

export function ShowcaseSourceChip({ source, className }: ShowcaseSourceChipProps) {
  if (source === "random") return null;
  const mark = MARK_BY_KEY[source];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm",
        mark.activeClass,
        className,
      )}
    >
      <mark.Icon size={10} fill="currentColor" aria-hidden="true" />
      {mark.label}
    </span>
  );
}
