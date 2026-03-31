import { cn } from "@/lib/utils";
import type { EntityVisual } from "@/lib/entity-visual";

type EntityBadgeProps = {
  visual: EntityVisual;
  /** sm = 32px (cards), md = 36px (list rows), lg = 48px (detail page header) */
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE: Record<NonNullable<EntityBadgeProps["size"]>, string> = {
  sm: "h-8 w-8 rounded-lg text-[11px]",
  md: "h-9 w-9 rounded-lg text-xs",
  lg: "h-12 w-12 rounded-xl text-sm",
};

export function EntityBadge({ visual, size = "md", className }: EntityBadgeProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 select-none items-center justify-center font-semibold tracking-wider",
        SIZE[size],
        visual.badgeBg,
        visual.badgeText,
        className,
      )}
      aria-hidden="true"
    >
      {visual.monogram}
    </div>
  );
}
