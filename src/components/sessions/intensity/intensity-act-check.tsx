"use client";

import { useEffect, useRef, useState } from "react";
import { Images, SlidersHorizontal, StickyNote } from "lucide-react";
import { IntensityExtrasPicker, type PickerExtra, type PickerGroup } from "@/components/intensity/intensity-extras-picker";
import { IntensityHoverText } from "@/components/intensity/intensity-hover-text";
import { formatIntensity, intensityColor, intensityTextColor } from "@/lib/intensity";
import { cn } from "@/lib/utils";

export type IntensityActCheckProps = {
  act: { id: string; name: string; description: string | null; level: number };
  /** Among the selected people: all have it, some, or none */
  state: "all" | "some" | "none";
  /** With several selected and only some having it: who does, e.g. "only Anna (AB-1)" */
  holders: string | null;
  /** Its value (one person) or range (several), and how it comes about */
  value: { min: number; max: number } | null;
  /** The top of the tenant's scale — the value's colour runs up to it */
  scaleMax: number;
  explain: string | null;
  /** One person selected — notes and own extras are theirs */
  single: boolean;
  /** For the single person: the extras it carries and those it inherits; saved once the tick is stored */
  effective: string[];
  inherited: string[];
  saved: boolean;
  note: string | null;
  /** How many photos of the session are evidence for it (single person) */
  photos: number;
  onPhotos: () => void;
  extras: PickerExtra[];
  groups: PickerGroup[];
  onTick: (ticked: boolean) => void;
  onExtras: (extraIds: string[]) => void;
  onNote: (note: string) => void;
};

// One act to tick, read left to right in one glance: ☐ level · title · value ·
// note · photos · extras — all close together. With several people selected it shows
// whether all, some (− and who) or none have it; ticking sets it for all. Notes
// and an act's own extras belong to one person, so they need one selected.
export function IntensityActCheck(props: IntensityActCheckProps) {
  const { act, state, holders, value, scaleMax, explain, single, effective, inherited, saved, note, photos, onPhotos, extras, groups, onTick, onExtras, onNote } = props;
  const [open, setOpen] = useState(false);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const box = useRef<HTMLInputElement>(null);
  const ticked = state !== "none";
  const own = single && ticked && (effective.length !== inherited.length || effective.some((id) => !inherited.includes(id)));
  const editable = single && ticked && saved;

  useEffect(() => {
    if (box.current) box.current.indeterminate = state === "some";
  }, [state]);

  function startNote() {
    setDraft(note ?? "");
    setWriting(true);
  }
  function saveNote() {
    setWriting(false);
    if (draft.trim() !== (note ?? "")) onNote(draft);
  }

  const valueText = value ? (value.min === value.max ? formatIntensity(value.max) : `${formatIntensity(value.min)}–${formatIntensity(value.max)}`) : null;
  const needOne = "Select one person to use this";

  return (
    <li className={cn("rounded-lg px-2 py-1 transition-colors", state === "all" ? "bg-primary/10" : state === "some" ? "bg-primary/5" : "hover:bg-muted/40")}>
      <div className="flex items-center gap-2">
        <input
          ref={box}
          type="checkbox"
          checked={state === "all"}
          onChange={() => onTick(state !== "all")}
          aria-label={act.name}
          className="h-4 w-4 shrink-0 accent-primary"
        />
        <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground" title="Level">
          {formatIntensity(act.level)}
        </span>
        <IntensityHoverText side="top" text={act.description} className="min-w-0">
          <button
            type="button"
            onClick={() => onTick(state !== "all")}
            className={cn(
              "min-w-0 text-left text-sm",
              ticked ? "font-medium" : "text-foreground/80",
              act.description && "underline decoration-dotted decoration-muted-foreground/50 underline-offset-4",
            )}
            tabIndex={-1}
          >
            {act.name}
          </button>
        </IntensityHoverText>
        {valueText && (
          <IntensityHoverText side="top" text={explain} className="shrink-0">
            <span
              className="inline-flex min-w-[2.9em] justify-center rounded-md px-1 text-xs font-semibold tabular-nums"
              // The heat of the highest value shown
              style={{ backgroundColor: intensityColor(value!.max, scaleMax), color: intensityTextColor(value!.max, scaleMax) }}
              aria-label={`Value ${valueText}`}
            >
              {valueText}
            </span>
          </IntensityHoverText>
        )}
        {state === "some" && holders && <span className="min-w-0 truncate text-[11px] text-muted-foreground">{holders}</span>}
        {ticked && (
          <>
            <button
              type="button"
              onClick={startNote}
              disabled={!editable}
              aria-label={note ? `Edit the note on ${act.name}` : `Add a note to ${act.name}`}
              title={single ? (note ? "Edit the note" : "Add a note") : needOne}
              className={cn(
                "shrink-0 rounded p-1 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent",
                note ? "text-primary" : "text-muted-foreground",
              )}
            >
              <StickyNote size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onPhotos}
              disabled={!editable}
              aria-label={photos ? `Photos of ${act.name}: ${photos} — change` : `Photos as evidence for ${act.name}`}
              title={single ? (photos ? `${photos} photo${photos === 1 ? "" : "s"} as evidence` : "Pick photos as evidence") : needOne}
              className={cn(
                "inline-flex shrink-0 items-center gap-0.5 rounded p-1 text-[11px] tabular-nums transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent",
                editable && photos ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Images size={13} aria-hidden="true" />
              {editable && photos > 0 && photos}
            </button>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              disabled={!editable}
              aria-expanded={editable && open}
              aria-label={`Extras of ${act.name}`}
              title={single ? (own ? "This act has extras of its own" : "Give this act extras of its own") : needOne}
              className={cn(
                "shrink-0 rounded p-1 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent",
                own ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
              )}
            >
              <SlidersHorizontal size={13} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      {editable && writing && (
        <input
          autoFocus
          value={draft}
          maxLength={300}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(note ?? "");
              setWriting(false);
            }
          }}
          placeholder="A short note on this act…"
          aria-label={`Note on ${act.name}`}
          className="ml-16 mt-1 block h-7 w-[calc(100%-4rem)] rounded-md border border-white/15 bg-background/60 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
      )}
      {single && ticked && !writing && note && (
        <button
          type="button"
          onClick={startNote}
          className="ml-16 mt-0.5 block max-w-[calc(100%-4rem)] rounded px-1 text-left text-xs italic text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          aria-label={`Note on ${act.name}: ${note} — edit`}
        >
          {note}
        </button>
      )}
      {editable && open && (
        <div className="ml-16 mt-1.5 space-y-1 border-t border-white/10 pb-1 pt-1.5">
          <p className="text-[11px] text-muted-foreground">
            Extras for this act only — marked where it departs from the session&apos;s.
          </p>
          <IntensityExtrasPicker
            extras={extras}
            groups={groups}
            selected={effective}
            inherited={inherited}
            onChange={onExtras}
            context={act.name}
            max={scaleMax}
          />
        </div>
      )}
    </li>
  );
}
