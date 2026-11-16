"use client";

import { cn } from "@/lib/utils";
import type { GalleryItem } from "@/lib/types";
import type { GalleryCastMember } from "@/lib/types/gallery";

type PeopleShownChipsProps = {
  item: GalleryItem;
  /** The image's session leads and support that are in the gallery's cast directory */
  sessionCast: string[];
  supportCast: string[];
  castById: Map<string, GalleryCastMember>;
  onSetHiddenPersons?: (itemId: string, hiddenPersonIds: string[]) => void;
  onSetShownSupport?: (itemId: string, shownSupportIds: string[], focusSupportIds: string[]) => void;
  onSetBackgroundPersons?: (itemId: string, backgroundPersonIds: string[]) => void;
};

const SEGMENT =
  "border-l px-1.5 py-1 text-[10px] uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const BG_LIT = "border-sky-300/30 bg-sky-400/25 text-sky-100 hover:bg-sky-400/35";
const BG_OFF = "border-white/15 text-white/40 hover:bg-white/10 hover:text-white";

/**
 * Who an image shows, and who it is about (ADR-0023, support 2026-10-24, focus
 * ADR-0039). Each chip: the name toggles shown ↔ not shown; the fixed `bg`
 * segment toggles the focus ↔ only in the shot (on someone not shown it shows
 * them in the shot). Focus = solid green, in the shot = green outline with `bg`
 * lit, not shown = struck through (appearing: dashed). The segments are always
 * there, so nothing moves when a state changes.
 */
export function PeopleShownChips({
  item,
  sessionCast,
  supportCast,
  castById,
  onSetHiddenPersons,
  onSetShownSupport,
  onSetBackgroundPersons,
}: PeopleShownChipsProps) {
  const hidden = new Set(item.hiddenPersonIds ?? []);
  const background = new Set((item.backgroundPersonIds ?? []).filter((id) => sessionCast.includes(id)));
  const shownSupport = new Set((item.shownSupportIds ?? []).filter((id) => supportCast.includes(id)));
  const focusSupport = new Set((item.focusSupportIds ?? []).filter((id) => shownSupport.has(id)));

  const setBackground = (next: Set<string>) => onSetBackgroundPersons?.(item.id, [...next]);
  const setSupport = (shown: Set<string>, focus: Set<string>) =>
    onSetShownSupport?.(item.id, [...shown], [...focus].filter((id) => shown.has(id)));
  // "Only X" and "Deselect all" mean nobody else — support included
  const clearSupport = () => {
    if (shownSupport.size > 0) setSupport(new Set(), new Set());
  };

  const chipClass = (shown: boolean, inShot: boolean, dashed: boolean) =>
    cn(
      "inline-flex items-center overflow-hidden rounded-full border text-xs font-medium transition-all",
      !shown && dashed && "border-dashed border-white/15 bg-transparent text-white/45 hover:bg-white/10 hover:text-white/75",
      !shown && !dashed && "border-transparent bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70",
      shown && inShot && "border-emerald-400/50 bg-transparent text-emerald-100/85",
      shown && !inShot && "border-emerald-400/40 bg-emerald-400/15 text-emerald-100",
    );

  const stateText = (shown: boolean, inShot: boolean) =>
    !shown ? "not shown" : inShot ? "in the shot, not the focus" : "the focus";

  return (
    <div className="space-y-1.5 pb-2">
      {/* Quick actions — a fast path when only 1–2 of a large cast are shown */}
      {sessionCast.length > 2 && (
        <div className="flex items-center gap-2 px-0.5 text-[11px] text-white/50">
          <button type="button" onClick={() => onSetHiddenPersons?.(item.id, [])} className="transition-colors hover:text-white">
            Select all
          </button>
          <span className="text-white/20">·</span>
          <button
            type="button"
            onClick={() => {
              onSetHiddenPersons?.(item.id, [...sessionCast]);
              clearSupport();
            }}
            className="transition-colors hover:text-white"
          >
            Deselect all
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-1" data-testid="people-shown-leads">
        {sessionCast.map((pid) => {
          const member = castById.get(pid)!;
          const isShown = !hidden.has(pid);
          const inShot = isShown && background.has(pid);
          return (
            <span key={pid} data-person-id={pid} data-state={!isShown ? "hidden" : inShot ? "background" : "focus"} className={chipClass(isShown, inShot, false)}>
              <button
                type="button"
                onClick={() => {
                  const next = new Set(hidden);
                  if (isShown) next.add(pid);
                  else next.delete(pid);
                  onSetHiddenPersons?.(item.id, [...next]);
                }}
                className={cn("px-2 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring", !isShown && "line-through")}
                aria-pressed={isShown}
                title={`${member.name} — ${stateText(isShown, inShot)} (click to ${isShown ? "mark absent" : "include"})`}
              >
                {member.name}
              </button>
              <button
                type="button"
                onClick={() => {
                  // Not shown → in the shot (the server shows them again)
                  const next = new Set(background);
                  if (inShot) next.delete(pid);
                  else next.add(pid);
                  setBackground(next);
                }}
                className={cn(SEGMENT, inShot ? BG_LIT : BG_OFF)}
                aria-pressed={inShot}
                aria-label={`${member.name}: in the shot, not the focus`}
                title={inShot ? `${member.name} is only in the shot — click to make them the focus` : `Mark ${member.name} as only in the shot, not the focus (left out of their showcase)`}
              >
                bg
              </button>
              {/* "Only this one" — sets the shown set to just this person */}
              {sessionCast.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    onSetHiddenPersons?.(item.id, sessionCast.filter((id) => id !== pid));
                    clearSupport();
                  }}
                  className={cn(SEGMENT, BG_OFF)}
                  title={`Show only ${member.name}`}
                  aria-label={`Show only ${member.name}`}
                >
                  only
                </button>
              )}
            </span>
          );
        })}
      </div>
      {supportCast.length > 0 && (
        <div className="space-y-1 pt-0.5">
          <p className="px-0.5 text-[10px] uppercase tracking-wide text-white/40">Appearing</p>
          <div className="flex flex-wrap gap-1" data-testid="people-shown-support">
            {supportCast.map((pid) => {
              const member = castById.get(pid)!;
              const isShown = shownSupport.has(pid);
              const inShot = isShown && !focusSupport.has(pid);
              return (
                <span key={pid} data-person-id={pid} data-state={!isShown ? "hidden" : inShot ? "background" : "focus"} className={chipClass(isShown, inShot, true)}>
                  <button
                    type="button"
                    onClick={() => {
                      const shown = new Set(shownSupport);
                      const focus = new Set(focusSupport);
                      if (isShown) {
                        shown.delete(pid);
                        focus.delete(pid);
                      } else shown.add(pid); // in the shot
                      setSupport(shown, focus);
                    }}
                    aria-pressed={isShown}
                    title={
                      isShown
                        ? `${member.name} — ${stateText(true, inShot)} (click to unmark)`
                        : `${member.name} — only appears in the session; click if this image shows them`
                    }
                    className="px-2 py-0.5 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {member.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const shown = new Set(shownSupport);
                      const focus = new Set(focusSupport);
                      if (!isShown) shown.add(pid); // not shown → in the shot
                      else if (inShot) focus.add(pid);
                      else focus.delete(pid);
                      setSupport(shown, focus);
                    }}
                    className={cn(SEGMENT, "py-0.5", inShot ? BG_LIT : BG_OFF)}
                    aria-pressed={inShot}
                    aria-label={`${member.name}: in the shot, not the focus`}
                    title={
                      inShot
                        ? `${member.name} is only in the shot — click to make them the focus (the photo joins their showcase)`
                        : isShown
                          ? `${member.name} is the focus — click to mark as only in the shot`
                          : `Mark ${member.name} as in the shot`
                    }
                  >
                    bg
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}
      <p className="px-0.5 text-[10px] text-white/35">bg = in the shot, not the focus — left out of their showcase</p>
    </div>
  );
}
