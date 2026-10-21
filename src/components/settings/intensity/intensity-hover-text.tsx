"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type IntensityHoverTextProps = {
  /** Shown on hover and keyboard focus; nothing to show leaves the children as they are */
  text: string | null;
  /** Where it opens — away from controls beside the title */
  side?: "top" | "right" | "bottom" | "left";
  children: React.ReactNode;
};

// A title's description, on hover — how the compact catalog (and later the
// act picker on a session) shows what a title means.
export function IntensityHoverText({ text, side = "right", children }: IntensityHoverTextProps) {
  if (!text) return <>{children}</>;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="min-w-0 flex-1">{children}</div>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs whitespace-pre-line text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
