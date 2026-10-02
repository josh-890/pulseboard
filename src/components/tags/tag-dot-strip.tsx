import type { TagChipData } from "@/lib/types/tag";
import { cn } from "@/lib/utils";

export type TagDotStripProps = {
  tags: TagChipData[] | undefined;
  /** Dots shown before collapsing into "+N" */
  max?: number;
  className?: string;
};

// Quiet tile marker (ADR-0033): one dot per direct tag in its group colour.
// The names live in the tooltip and the accessible label; the tile's own
// hover reveals nothing extra, so a grid of tagged images stays calm.
export function TagDotStrip({ tags, max = 5, className }: TagDotStripProps) {
  if (!tags || tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const names = tags.map((t) => t.name).join(", ");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-black/45 px-1 py-0.5 backdrop-blur-sm",
        className,
      )}
      title={names}
      aria-label={`Tags: ${names}`}
      role="img"
    >
      {shown.map((t) => (
        <span
          key={t.id}
          className="inline-block size-1.5 rounded-full ring-1 ring-black/30"
          style={{ backgroundColor: t.group.color }}
        />
      ))}
      {tags.length > max && <span className="pl-0.5 text-[9px] leading-none text-white/80">+{tags.length - max}</span>}
    </span>
  );
}
