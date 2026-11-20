import { cn } from "@/lib/utils";
import type { ToneBucket } from "@/lib/tone";

export type ToneSwatchProps = {
  tone: ToneBucket | "color" | "mono";
  /** px edge of the tile */
  size?: "xs" | "sm" | "md";
  className?: string;
};

// A soft color wheel, a grey ramp, and the two split diagonally (ADR-0041).
// Decorative: the text next to it carries the meaning.
const BG: Record<ToneSwatchProps["tone"], string> = {
  color: "bg-[image:var(--tone-color)]",
  mono: "bg-[image:var(--tone-mono)]",
  mixed: "bg-[image:var(--tone-mixed)]",
};

const SIZE = { xs: "h-3 w-3 rounded-[3px]", sm: "h-4 w-4 rounded", md: "h-6 w-6 rounded-md" } as const;

/** Color / B&W / mixed as a little tile — the tone filter's visual key */
export function ToneSwatch({ tone, size = "sm", className }: ToneSwatchProps) {
  return (
    <span
      aria-hidden
      data-tone-swatch={tone}
      className={cn(
        "inline-block shrink-0 ring-1 ring-black/15 dark:ring-white/25",
        "[--tone-color:conic-gradient(from_210deg,#f43f5e,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#f43f5e)]",
        "[--tone-mono:linear-gradient(135deg,#f5f5f5_0%,#a3a3a3_50%,#262626_100%)]",
        "[--tone-mixed:linear-gradient(135deg,transparent_50%,#8a8a8a_50%),conic-gradient(from_210deg,#f43f5e,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#f43f5e)]",
        BG[tone],
        SIZE[size],
        className,
      )}
    />
  );
}

