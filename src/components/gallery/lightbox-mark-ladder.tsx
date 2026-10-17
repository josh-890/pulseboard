"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MARK_TIERS, type MarkKey } from "@/lib/media-mark-tiers";
import { MARK_BY_KEY } from "./media-marks";
import { LightboxToolbarButton } from "./lightbox-toolbar-button";

// The photo marks as the ladder they are (2026-10-17): Outtake ▸ ★ ▸ Iconic,
// lowest on the left, so climbing fills the pill from the left. The tiers
// themselves are enforced by the caller's onMark (markCascade).

export type LightboxMarkLadderProps = {
  marks: Record<MarkKey, boolean>;
  /** Iconic / outtake are tags; until their tags are loaded they can't be set */
  tagMarksReady: boolean;
  onMark: (key: MarkKey) => void;
};

export function LightboxMarkLadder({ marks, tagMarksReady, onMark }: LightboxMarkLadderProps) {
  return (
    <div role="group" aria-label="Marks" className="inline-flex shrink-0 items-center rounded-full bg-white/10 p-0.5">
      {MARK_TIERS.map((key, i) => {
        const mark = MARK_BY_KEY[key];
        const on = marks[key];
        return (
          <span key={key} className="inline-flex items-center">
            {i > 0 && <ChevronRight size={10} className="text-white/25" aria-hidden="true" />}
            <LightboxToolbarButton
              label={mark.label}
              shortcut={key}
              pressed={on}
              unavailable={key !== "favorite" && !tagMarksReady ? "Loading the marks…" : null}
              onClick={() => onMark(key)}
              onClassName={mark.activeClass}
              className={cn("size-7", !on && mark.idleClass)}
            >
              <mark.Icon size={15} fill={on ? "currentColor" : "none"} />
            </LightboxToolbarButton>
          </span>
        );
      })}
    </div>
  );
}
