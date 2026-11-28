"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Minus, Search, Users } from "lucide-react";
import { formatIntensity } from "@/lib/intensity";
import type { GalleryItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { ActState, PhotoIntensity } from "./use-photo-intensity";
import type { PhotoLead } from "./photo-intensity";

export type PhotoActPickerProps = {
  intensity: PhotoIntensity;
  /** The photos in hand — the viewer's one, or a gallery selection */
  items: GalleryItem[];
  /** The viewer is always dark */
  dark?: boolean;
  /** ← → page the viewer while the search is empty */
  onPrev?: () => void;
  onNext?: () => void;
};

type Row = { id: string; name: string; description: string | null; level: number; scenarioId: string; scenarioName: string };

// Rating an act where it is seen (2026-11-28): who (the people on the photo),
// which column (the one the photo suggests, the others as tabs), which act
// (type to find it anywhere). A pick ticks it for the chosen people where
// missing and links the photos; picking a linked act again takes the photos
// back (the tick stays). ↑↓ move, ⏎ picks, ← → page while the search is empty.
export function PhotoActPicker({ intensity, items, dark, onPrev, onNext }: PhotoActPickerProps) {
  const first = items[0];
  const leads = useMemo(() => {
    const byPerson = new Map<string, PhotoLead>();
    for (const item of items) for (const l of intensity.peopleOn(item).leads) if (!byPerson.has(l.personId)) byPerson.set(l.personId, l);
    return [...byPerson.values()];
  }, [items, intensity]);
  const others = first ? intensity.peopleOn(first).others : [];
  const chosen = first ? intensity.chosenOn(first) : [];
  const suggested = first ? intensity.suggestedScenarioId(first, chosen[0]) : null;
  const scenarios = intensity.catalog.scenarios.filter((s) => s.acts.length > 0);

  const [query, setQuery] = useState("");
  // A tab picked by hand holds while the photos suggest the same column
  const [tabPick, setTabPick] = useState<{ suggested: string | null; tab: string } | null>(null);
  const tab = (tabPick && tabPick.suggested === suggested ? tabPick.tab : null) ?? suggested ?? scenarios[0]?.id ?? null;
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const rows: Row[] = q
    ? scenarios.flatMap((s) =>
        s.acts
          .filter((a) => a.name.toLowerCase().includes(q) || (a.description ?? "").toLowerCase().includes(q))
          .map((a) => ({ ...a, scenarioId: s.id, scenarioName: s.name })),
      )
    : (scenarios.find((s) => s.id === tab)?.acts ?? []).map((a) => ({ ...a, scenarioId: tab!, scenarioName: "" }));
  const at = Math.min(active, Math.max(0, rows.length - 1));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [at]);

  function pick(row: Row) {
    if (chosen.length === 0) return;
    const st = intensity.stateAt(items, chosen, row.id);
    if (st.linked === "all") intensity.unlink(items, chosen, row.id);
    else intensity.apply(items, chosen, row.id);
  }

  function togglePerson(personId: string) {
    const next = chosen.includes(personId) ? chosen.filter((id) => id !== personId) : [...chosen, personId];
    intensity.setPicked(next.length ? next : [personId]);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(at + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(at - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[at];
      if (row) pick(row);
    } else if (!query && e.key === "ArrowLeft" && onPrev) {
      e.preventDefault();
      onPrev();
    } else if (!query && e.key === "ArrowRight" && onNext) {
      e.preventDefault();
      onNext();
    }
  }

  const muted = dark ? "text-white/55" : "text-muted-foreground";
  if (leads.length === 0) {
    return (
      <p className={cn("px-1 py-2 text-xs", muted)}>
        {others.length ? "Only people appearing are on this photo — they carry no intensity." : "Nobody of this session's models is on this photo."}
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="photo-act-picker">
      {/* Who: the leads on the photo; one alone is chosen, several can be */}
      <div role="group" aria-label="For" className="flex flex-wrap items-center gap-1">
        <Users size={13} aria-hidden className={cn("mr-0.5 shrink-0", muted)} />
        {leads.map((l) => {
          const on = chosen.includes(l.personId);
          const c = intensity.castById.get(l.personId);
          return (
            <button
              key={l.personId}
              type="button"
              aria-pressed={on}
              onClick={() => togglePerson(l.personId)}
              className={cn(
                "flex min-w-0 items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[11px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2",
                dark ? "focus-visible:ring-white/60" : "focus-visible:ring-ring",
                on
                  ? "border-primary/60 bg-primary/20"
                  : dark
                    ? "border-white/20 text-white/60 hover:border-white/40 hover:text-white"
                    : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {c?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- MinIO URL
                <img src={c.avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
              ) : (
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px]", dark ? "bg-white/15" : "bg-muted")}>
                  {l.label.slice(0, 1)}
                </span>
              )}
              <span className="truncate">{l.label}</span>
            </button>
          );
        })}
        {others.map((o) => (
          <span
            key={o.id}
            title="Only appearing — carries no intensity"
            aria-disabled="true"
            className={cn("rounded-full border border-dashed px-2 py-0.5 text-[11px]", dark ? "border-white/15 text-white/35" : "border-border/50 text-muted-foreground/60")}
          >
            {o.label}
          </span>
        ))}
      </div>

      {/* Which act: type to search every column */}
      <label className={cn("flex items-center gap-1.5 rounded-md border px-2", dark ? "border-white/15 bg-white/5" : "border-border bg-background")}>
        <Search size={13} aria-hidden className={muted} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          placeholder="Find an act…"
          aria-label="Find an act"
          aria-controls="photo-act-rows"
          aria-activedescendant={rows[at] ? `photo-act-${rows[at]!.id}` : undefined}
          className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-current placeholder:opacity-50"
        />
      </label>

      {!q && (
        <div role="tablist" aria-label="Scenario" className="flex flex-wrap gap-1">
          {scenarios.map((s) => {
            const on = s.id === tab;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setTabPick({ suggested, tab: s.id });
                  setActive(0);
                  inputRef.current?.focus();
                }}
                title={s.id === suggested ? "Suggested by who is on the photo" : undefined}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors duration-150",
                  on ? "bg-primary text-primary-foreground" : dark ? "bg-white/10 text-white/70 hover:bg-white/15" : "bg-muted hover:bg-muted/70",
                )}
              >
                {s.name}
                {s.id === suggested && <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-primary-foreground" : "bg-primary")} />}
              </button>
            );
          })}
        </div>
      )}

      <ul id="photo-act-rows" ref={listRef} role="listbox" aria-label="Acts" className="max-h-72 space-y-0.5 overflow-y-auto">
        {rows.length === 0 && <li className={cn("px-1 py-2 text-xs", muted)}>No act matches “{query}”.</li>}
        {rows.map((row, i) => {
          const st = intensity.stateAt(items, chosen, row.id);
          return (
            <li key={`${row.scenarioId}-${row.id}`} id={`photo-act-${row.id}`} role="option" aria-selected={i === at} data-row={i}>
              <button
                type="button"
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(row)}
                aria-label={`${row.name}${st.ticked === "all" ? ", ticked" : ""}${st.linked === "all" ? ", this photo linked" : ""}`}
                title={row.description ?? undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors",
                  i === at ? (dark ? "bg-white/15" : "bg-muted") : dark ? "hover:bg-white/10" : "hover:bg-muted/60",
                )}
              >
                <span className={cn("w-7 shrink-0 text-right text-xs tabular-nums", muted)}>{formatIntensity(row.level)}</span>
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                {row.scenarioName && <span className={cn("shrink-0 text-[10px]", muted)}>{row.scenarioName}</span>}
                <Mark state={st.ticked} label="ticked" icon="check" dark={dark} />
                <Mark state={st.linked} label="photo linked" icon="camera" dark={dark} />
              </button>
            </li>
          );
        })}
      </ul>
      <p className={cn("px-1 text-[10px]", muted)}>⏎ tick and link · again: unlink · ↑↓ · ← → photo · Esc</p>
    </div>
  );
}

function Mark({ state, label, icon, dark }: { state: ActState; label: string; icon: "check" | "camera"; dark?: boolean }) {
  if (state === "none") return <span aria-hidden className="w-4 shrink-0" />;
  const Icon = state === "some" ? Minus : icon === "check" ? Check : Camera;
  return (
    <span
      title={state === "some" ? `${label} — some of them` : label}
      className={cn("flex w-4 shrink-0 justify-center", state === "all" ? "text-primary" : dark ? "text-white/50" : "text-muted-foreground")}
    >
      <Icon size={13} aria-hidden />
    </span>
  );
}
