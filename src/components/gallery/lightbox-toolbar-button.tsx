"use client";

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { shortcutLabel, type ShortcutId } from "./lightbox-shortcuts";

// One button of the viewer's toolbar (2026-10-17): icon only, with a quick
// tooltip naming it and its key. A button that doesn't apply here stays in
// place, dimmed, and its tooltip says why — so nothing on the bar moves.

/** The one "switched on" look for every toggle (view, compare); amber stays Iconic's */
export const TOOLBAR_ON = "bg-white/25 text-white ring-1 ring-inset ring-white/40";

export type LightboxToolbarButtonProps = {
  label: string;
  shortcut?: ShortcutId;
  /** A toggle: true / false; leave out for a plain action */
  pressed?: boolean;
  /** Shown instead of acting; the tooltip gives the reason */
  unavailable?: string | null;
  onClick: () => void;
  /** Extra classes, e.g. a segment's rounding or an on-colour */
  className?: string;
  /** Applied when pressed (defaults to TOOLBAR_ON) */
  onClassName?: string;
  children: ReactNode;
};

export function LightboxToolbarButton({
  label,
  shortcut,
  pressed,
  unavailable,
  onClick,
  className,
  onClassName = TOOLBAR_ON,
  children,
}: LightboxToolbarButtonProps) {
  const key = shortcut ? shortcutLabel(shortcut) : null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={unavailable ? undefined : onClick}
          aria-label={label}
          aria-pressed={pressed}
          aria-disabled={unavailable ? true : undefined}
          aria-keyshortcuts={key ?? undefined}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
            unavailable ? "cursor-not-allowed opacity-35" : "hover:bg-white/15 hover:text-white",
            pressed && !unavailable && onClassName,
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="dark">
        <span className="flex items-center gap-2">
          {label}
          {key && <kbd className="rounded border border-current/30 px-1 font-mono text-[10px] leading-4 opacity-80">{key}</kbd>}
        </span>
        {unavailable && <span className="block opacity-70">{unavailable}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
