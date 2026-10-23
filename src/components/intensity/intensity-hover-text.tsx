"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type IntensityHoverTextProps = {
  /** Shown on hover and keyboard focus; nothing to show leaves the children as they are */
  text: string | null;
  /** Where it opens — away from controls beside the title */
  side?: "top" | "right" | "bottom" | "left";
  /** The trigger wrapper — by default it takes the free width of a flex row */
  className?: string;
  /** "boundary": a darker tooltip, told apart from an act's at a glance */
  tone?: "default" | "boundary";
  children: React.ReactNode;
};

/** A boundary's tooltip: the usual tooltip colour, a quarter darker — not an act's */
export const BOUNDARY_TOOLTIP = "bg-[color-mix(in_srgb,var(--foreground)_75%,black)]";

// A title's description, on hover — how the compact catalog (and later the
// act picker on a session) shows what a title means.
export function IntensityHoverText({
  text,
  side = "right",
  className = "min-w-0 flex-1",
  tone = "default",
  children,
}: IntensityHoverTextProps) {
  if (!text) return <>{children}</>;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={className}>{children}</div>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className={tone === "boundary" ? `max-w-xs whitespace-pre-line text-xs ${BOUNDARY_TOOLTIP}` : "max-w-xs whitespace-pre-line text-xs"}
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
