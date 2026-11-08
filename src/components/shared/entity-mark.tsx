import { cn } from "@/lib/utils";
import { resolveBrandMark, type EntityBrand } from "@/lib/brand-mark";

type MarkSize = "xs" | "sm" | "md" | "lg" | "xl";

type EntityMarkProps = {
  brand: EntityBrand;
  /** wordmark = the name in its brand font (heroes, tiles); tile = a square monogram (rows, chips) */
  variant?: "wordmark" | "tile";
  size?: MarkSize;
  /** Round tile — an artist's avatar */
  round?: boolean;
  className?: string;
};

const WORDMARK_TEXT: Record<MarkSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-lg",
  lg: "text-2xl",
  xl: "text-3xl sm:text-4xl",
};

const WORDMARK_LOGO: Record<MarkSize, string> = {
  xs: "h-4 max-w-[5rem]",
  sm: "h-5 max-w-[7rem]",
  md: "h-8 max-w-[10rem]",
  lg: "h-12 max-w-[14rem]",
  xl: "h-20 max-w-[20rem] sm:h-24",
};

const TILE_BOX: Record<MarkSize, string> = {
  xs: "h-5 w-5 rounded",
  sm: "h-8 w-8 rounded-lg",
  md: "h-10 w-10 rounded-lg",
  lg: "h-14 w-14 rounded-xl",
  xl: "h-24 w-24 rounded-2xl",
};

/** Monogram text size by box size and by length (MET fits where FIT-LONG doesn't) */
const TILE_TEXT: Record<MarkSize, [string, string, string]> = {
  xs: ["text-[9px]", "text-[7px]", "text-[6px]"],
  sm: ["text-sm", "text-[11px]", "text-[9px]"],
  md: ["text-base", "text-xs", "text-[10px]"],
  lg: ["text-2xl", "text-lg", "text-sm"],
  xl: ["text-4xl", "text-3xl", "text-2xl"],
};

/**
 * A channel's, label's or artist's mark: the uploaded logo, else the generated
 * wordmark or monogram tile (brand font + colour from the name, overridable).
 */
export function EntityMark({ brand, variant = "tile", size = "sm", round, className }: EntityMarkProps) {
  const mark = resolveBrandMark(brand);

  if (variant === "wordmark") {
    if (brand.logoUrl) {
      return (
        // eslint-disable-next-line @next/next/no-img-element -- MinIO URL, not a static asset
        <img src={brand.logoUrl} alt={brand.name} className={cn("w-auto object-contain object-left", WORDMARK_LOGO[size], className)} />
      );
    }
    return (
      <span
        className={cn(
          "block leading-tight",
          // Heroes wrap a long name onto a second line; small marks stay on one
          size === "lg" || size === "xl" ? "line-clamp-2 break-words" : "truncate",
          WORDMARK_TEXT[size],
          mark.font.className,
          mark.color.text,
          className,
        )}
      >
        {brand.name}
      </span>
    );
  }

  const box = cn("flex shrink-0 select-none items-center justify-center overflow-hidden", TILE_BOX[size], round && "rounded-full", className);
  if (brand.logoUrl) {
    return (
      <span className={cn(box, "bg-white/90 p-0.5 dark:bg-white/10")} title={brand.name}>
        {/* eslint-disable-next-line @next/next/no-img-element -- MinIO URL, not a static asset */}
        <img src={brand.logoUrl} alt={brand.name} className={cn("h-full w-full", round ? "object-cover" : "object-contain")} />
      </span>
    );
  }
  const len = mark.monogram.length;
  const text = TILE_TEXT[size][len <= 2 ? 0 : len === 3 ? 1 : 2];
  return (
    <span className={cn(box, mark.color.tileBg)} title={brand.name} aria-hidden="true">
      <span className={cn("leading-none", text, mark.font.className, mark.color.text)}>{mark.monogram}</span>
    </span>
  );
}
