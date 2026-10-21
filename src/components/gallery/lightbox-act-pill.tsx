"use client";

import { Gauge } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ActEvidenceList, type EvidenceAct } from "@/components/intensity/act-evidence-list";
import { cn } from "@/lib/utils";
import { shortcutLabel } from "./lightbox-shortcuts";

export type LightboxActPillProps = {
  acts: EvidenceAct[];
  /** The ContributionActs this photo is evidence for */
  linked: string[];
  onToggle: (contributionActId: string, linked: boolean) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// Acts in the viewer (ADR-0036, 3b): which ticked acts this photo is evidence
// for — the count on the pill, the list behind it (A).
export function LightboxActPill({ acts, linked, onToggle, open, onOpenChange }: LightboxActPillProps) {
  const here = linked.filter((id) => acts.some((a) => a.id === id));
  const names = acts.filter((a) => here.includes(a.id)).map((a) => a.actName);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={here.length ? `Evidence for ${here.length} act${here.length === 1 ? "" : "s"} — change` : "Evidence for an act"}
              aria-keyshortcuts={shortcutLabel("acts")}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 text-xs transition-colors duration-150 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                here.length ? "text-white" : "text-white/70",
                open && "bg-white/15 text-white",
              )}
            >
              <Gauge size={16} aria-hidden="true" />
              {here.length > 0 && <span className="tabular-nums">{here.length}</span>}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6} className="dark">
          <span className="flex items-center gap-2">
            Evidence for an act
            <kbd className="rounded border border-current/30 px-1 font-mono text-[10px] leading-4 opacity-80">{shortcutLabel("acts")}</kbd>
          </span>
          {names.length > 0 && <span className="block opacity-70">{names.join(" · ")}</span>}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="center"
        sideOffset={8}
        className="dark w-80 p-2"
        // Esc closes the list only — it must not travel on and close the viewer
        onEscapeKeyDown={(e) => e.stopPropagation()}
      >
        <p className="mb-1.5 px-1 text-[11px] text-muted-foreground">This photo as evidence for…</p>
        <ActEvidenceList acts={acts} stateOf={(id) => (here.includes(id) ? "all" : "none")} onToggle={onToggle} dark />
      </PopoverContent>
    </Popover>
  );
}
