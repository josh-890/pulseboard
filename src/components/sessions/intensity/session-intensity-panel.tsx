"use client";

import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { ChevronRight, Copy, Search, X } from "lucide-react";
import { toast } from "sonner";
import { IntensityExtrasPicker } from "@/components/intensity/intensity-extras-picker";
import { IntensityHoverText } from "@/components/intensity/intensity-hover-text";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  copyContributionIntensityAction,
  restoreContributionActsAction,
  setContributionActExtrasAction,
  setActEvidenceAction,
  setContributionActNoteAction,
  setContributionsActAction,
  setContributionsExtrasAction,
} from "@/lib/actions/intensity-actions";
import { applySharedExtras, formatIntensity, overridesFor } from "@/lib/intensity";
import { IntensityValue } from "@/components/intensity/intensity-value";
import type { SessionIntensity } from "@/lib/services/intensity-service";
import type { SimpleActionResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ActEvidencePicker } from "./act-evidence-picker";
import { IntensityActCheck } from "./intensity-act-check";
import { initialPanelState, personView, reducePanel, type PanelChange, type RestoreItem } from "./panel-state";
import { useIntensityPanel } from "./intensity-panel-provider";
import type { SessionIntensityCatalog } from "./types";

export type SessionIntensityPanelProps = {
  sessionId: string;
  contributions: SessionIntensity;
  catalog: SessionIntensityCatalog;
};

// The intensity panel beside the session's photos (ADR-0036): the people on
// camera as chips — one or several selected — over a single editor. With
// several selected, every change applies to all of them; a half tick (−) says
// only some have an act, and names them. Changes show at once and save behind.
export function SessionIntensityPanel({ sessionId, contributions, catalog }: SessionIntensityPanelProps) {
  const { setOpen } = useIntensityPanel();
  const [state, apply] = useOptimistic(initialPanelState(contributions), reducePanel);
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>(() => (contributions[0] ? [contributions[0].id] : []));
  const [query, setQuery] = useState("");
  const [openScenarios, setOpenScenarios] = useState<Set<string> | null>(null);
  const [picking, setPicking] = useState<{ contributionId: string; actId: string; contributionActId: string; title: string; mediaIds: string[] } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const acts = useMemo(
    () => new Map(catalog.scenarios.flatMap((s) => s.acts.map((a) => [a.id, { level: a.level, name: a.name }] as const))),
    [catalog.scenarios],
  );
  const groupOf = useMemo(() => {
    const m = new Map(catalog.extras.map((e) => [e.id, e.groupId]));
    return (id: string) => m.get(id) ?? null;
  }, [catalog.extras]);

  const people = contributions.map((c) => ({ ...c, label: `${c.person.name} (${c.person.icgId})` }));
  const views = new Map(people.map((c) => [c.id, personView(state[c.id]!, catalog, acts)]));
  const chosen = people.filter((c) => selected.includes(c.id));
  const single = chosen.length === 1 ? chosen[0]! : null;

  if (people.length === 0) {
    return (
      <PanelFrame onClose={() => setOpen(false)}>
        <p className="text-sm text-muted-foreground">No one on camera in this session yet — add a contributor first.</p>
      </PanelFrame>
    );
  }

  function send(change: PanelChange, call: () => Promise<SimpleActionResult>, after?: () => void) {
    startTransition(async () => {
      apply(change);
      const result = await call();
      if (!result.success) toast.error(result.error ?? "Could not save");
      else after?.();
    });
  }

  // ── Selection ──
  function toggleChip(id: string) {
    setSelected((prev) => (prev.includes(id) ? (prev.length > 1 ? prev.filter((x) => x !== id) : prev) : [...prev, id]));
  }

  // ── Extras for the selection ──
  const extraSets = chosen.map((c) => state[c.id]!.extraIds);
  const common = catalog.extras.map((e) => e.id).filter((id) => extraSets.every((s) => s.includes(id)));
  const mixed = catalog.extras.map((e) => e.id).filter((id) => !common.includes(id) && extraSets.some((s) => s.includes(id)));
  function changeExtras(next: string[]) {
    const entries = chosen.map((c) => ({
      contributionId: c.id,
      extraIds: applySharedExtras(state[c.id]!.extraIds, common, next, groupOf),
    }));
    send({ kind: "extras", entries }, () => setContributionsExtrasAction(entries));
  }

  // ── Acts ──
  function tick(actId: string, on: boolean) {
    const ids = chosen.map((c) => c.id);
    if (on) {
      send({ kind: "tick", contributionIds: ids, actId, ticked: true }, () => setContributionsActAction(ids, actId, true));
      return;
    }
    // Unticking drops a note, own extras and photos with the act — offer them back
    const lost: RestoreItem[] = [];
    for (const c of chosen) {
      const a = state[c.id]!.acts.find((x) => x.actId === actId);
      if (a && (a.notes || a.overrides.length > 0 || a.mediaIds.length > 0)) {
        lost.push({ contributionId: c.id, actId, notes: a.notes, overrides: a.overrides, mediaIds: a.mediaIds });
      }
    }
    const name = acts.get(actId)?.name ?? "Act";
    const went = [
      lost.some((l) => l.notes) && "note",
      lost.some((l) => l.overrides.length) && "own extras",
      lost.some((l) => l.mediaIds.length) && "photos",
    ].filter(Boolean) as string[];
    send({ kind: "tick", contributionIds: ids, actId, ticked: false }, () => setContributionsActAction(ids, actId, false), () => {
      if (lost.length === 0) return;
      const what = went.length > 1 ? `${went.slice(0, -1).join(", ")} and ${went.at(-1)}` : went[0];
      toast(`${name} unticked — its ${what} went with it`, {
        action: {
          label: "Undo",
          onClick: () => send({ kind: "restore", items: lost }, () => restoreContributionActsAction(lost)),
        },
      });
    });
  }

  function copyFrom(fromId: string) {
    if (!single) return;
    send({ kind: "copy", fromId, toId: single.id }, () => copyContributionIntensityAction(fromId, single.id));
  }

  // ── Scenarios and search ──
  const q = query.trim().toLowerCase();
  const matches = (a: { name: string; description: string | null }) =>
    !q || a.name.toLowerCase().includes(q) || (a.description ?? "").toLowerCase().includes(q);
  const scenarios = catalog.scenarios
    .map((s) => ({ ...s, acts: s.acts.filter(matches) }))
    .filter((s) => s.acts.length > 0);
  const suggested = new Set(chosen.flatMap((c) => c.suggestedScenarioIds));
  const hasTicks = (sid: string) =>
    catalog.scenarios.find((s) => s.id === sid)!.acts.some((a) => chosen.some((c) => views.get(c.id)!.ticked.has(a.id)));
  const isOpen = (sid: string) => (q ? true : openScenarios ? openScenarios.has(sid) : suggested.has(sid) || hasTicks(sid));
  function toggleScenario(sid: string) {
    setOpenScenarios(() => {
      const base = new Set(catalog.scenarios.filter((s) => isOpen(s.id)).map((s) => s.id));
      if (base.has(sid)) base.delete(sid);
      else base.add(sid);
      return base;
    });
  }
  const firstMatch = q ? scenarios[0]?.acts[0] : undefined;

  return (
    <PanelFrame onClose={() => setOpen(false)}>
      {/* People: chips with their session value; several can be selected */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="People on camera">
          {people.map((c) => {
            const on = selected.includes(c.id);
            const v = views.get(c.id)!;
            return (
              <span key={c.id} className={cn("inline-flex overflow-hidden rounded-lg border text-xs", on ? "border-primary bg-primary/10" : "border-white/15")}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleChip(c.id)}
                  className="inline-flex items-center gap-1.5 px-2 py-1 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className={cn("h-2 w-2 shrink-0 rounded-full border", on ? "border-primary bg-primary" : "border-muted-foreground")} aria-hidden="true" />
                  <span className="font-medium">{c.person.name}</span>
                  <span className="text-muted-foreground">({c.person.icgId})</span>
                  <IntensityHoverText side="bottom" text={v.totalExplain} className="shrink-0">
                    <span className="ml-0.5" aria-label={v.total === null ? "no value" : `intensity ${formatIntensity(v.total)}`}>
                      <IntensityValue value={v.total} max={catalog.max} />
                    </span>
                  </IntensityHoverText>
                </button>
                {people.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSelected([c.id])}
                    aria-label={`Only ${c.label}`}
                    className="border-l border-white/15 px-1.5 text-[10px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  >
                    only
                  </button>
                )}
              </span>
            );
          })}
          {people.length > 1 && (
            <button
              type="button"
              onClick={() => setSelected(people.map((c) => c.id))}
              disabled={selected.length === people.length}
              className="rounded-lg border border-white/15 px-2 py-1 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-40"
            >
              All
            </button>
          )}
        </div>
        <div className="flex min-h-6 items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {single ? `Editing ${single.label}` : `${chosen.length} selected — every change applies to all of them`}
          </p>
          {single && people.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">
                  <Copy size={11} aria-hidden="true" /> Same as…
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Take their extras and the acts {single.person.name} lacks
                </DropdownMenuLabel>
                {people
                  .filter((c) => c.id !== single.id)
                  .map((c) => (
                    <DropdownMenuItem key={c.id} onSelect={() => copyFrom(c.id)}>
                      Same as {c.label}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground">Extras in this session — every act inherits them</p>
        <IntensityExtrasPicker
          extras={catalog.extras}
          groups={catalog.groups}
          selected={common}
          mixed={mixed}
          context={single ? single.label : `${chosen.length} people`}
          max={catalog.max}
          onChange={changeExtras}
        />
      </div>

      <label className="relative block">
        <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && firstMatch) {
              e.preventDefault();
              const all = chosen.every((c) => views.get(c.id)!.ticked.has(firstMatch.id));
              tick(firstMatch.id, !all);
              setQuery("");
            }
            if (e.key === "Escape" && query) {
              e.preventDefault();
              setQuery("");
            }
          }}
          placeholder="Find an act — Enter ticks the first"
          aria-label="Find an act"
          className="h-8 w-full rounded-md border border-white/15 bg-background/60 pl-7 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <ul className="space-y-1">
        {scenarios.length === 0 && <li className="px-1 text-sm text-muted-foreground">No act matches “{query}”.</li>}
        {scenarios.map((s) => {
          const open = isOpen(s.id);
          const here = s.acts.filter((a) => chosen.some((c) => views.get(c.id)!.ticked.has(a.id)));
          return (
            <li key={s.id} className="rounded-lg border border-white/10">
              <button
                type="button"
                onClick={() => toggleScenario(s.id)}
                aria-expanded={open}
                disabled={!!q}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
              >
                <ChevronRight size={14} className={cn("shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-90")} aria-hidden="true" />
                <span className="font-medium">{s.name}</span>
                {suggested.has(s.id) && (
                  <span className="rounded bg-primary/15 px-1.5 text-[10px] font-medium text-primary" title="Suggested from the cast">
                    suggested
                  </span>
                )}
                {here.length > 0 && <span className="text-xs tabular-nums text-muted-foreground">· {here.length} ticked</span>}
              </button>
              {open && (
                <ul className="space-y-0.5 px-1 pb-1.5" aria-label={`Acts in ${s.name}`}>
                  {s.acts.map((a) => {
                    const holding = chosen.filter((c) => views.get(c.id)!.ticked.has(a.id));
                    const st = holding.length === 0 ? "none" : holding.length === chosen.length ? "all" : "some";
                    const vals = holding.map((c) => views.get(c.id)!.ticked.get(a.id)!);
                    const mine = single ? views.get(single.id)!.ticked.get(a.id) : undefined;
                    return (
                      <IntensityActCheck
                        key={a.id}
                        act={a}
                        state={st}
                        holders={st === "some" ? `only ${holding.map((c) => c.person.name).join(", ")}` : null}
                        value={vals.length ? { min: Math.min(...vals.map((v) => v.value)), max: Math.max(...vals.map((v) => v.value)) } : null}
                        scaleMax={catalog.max}
                        explain={
                          vals.length === 0
                            ? null
                            : single
                              ? vals[0]!.explain
                              : holding.map((c, i) => `${c.person.name}: ${vals[i]!.explain}`).join("\n")
                        }
                        single={!!single}
                        effective={mine?.effective ?? []}
                        inherited={single ? state[single.id]!.extraIds : []}
                        saved={!!mine?.id}
                        note={mine?.notes ?? null}
                        photos={mine?.mediaIds.length ?? 0}
                        onPhotos={() => {
                          if (!single || !mine?.id) return;
                          setPicking({
                            contributionId: single.id,
                            actId: a.id,
                            contributionActId: mine.id,
                            title: `${a.name} — ${single.label}: photos as evidence`,
                            mediaIds: mine.mediaIds,
                          });
                        }}
                        extras={catalog.extras}
                        groups={catalog.groups}
                        onTick={(on) => tick(a.id, on)}
                        onExtras={(extraIds) => {
                          if (!single || !mine?.id) return;
                          const overrides = overridesFor(state[single.id]!.extraIds, extraIds);
                          send({ kind: "actExtras", contributionId: single.id, actId: a.id, overrides }, () =>
                            setContributionActExtrasAction(mine.id!, extraIds),
                          );
                        }}
                        onNote={(text) => {
                          if (!single || !mine?.id) return;
                          send({ kind: "note", contributionId: single.id, actId: a.id, notes: text.trim() || null }, () =>
                            setContributionActNoteAction(mine.id!, text),
                          );
                        }}
                      />
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {picking && (
        <ActEvidencePicker
          sessionId={sessionId}
          title={picking.title}
          initialIds={picking.mediaIds}
          onClose={() => setPicking(null)}
          onSave={(mediaIds) =>
            send({ kind: "evidence", contributionId: picking.contributionId, actId: picking.actId, mediaIds }, () =>
              setActEvidenceAction(picking.contributionActId, mediaIds),
            )
          }
        />
      )}
    </PanelFrame>
  );
}

function PanelFrame({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <section
      aria-label="Intensity panel"
      className="space-y-3 rounded-2xl border border-white/20 bg-card/80 p-3 shadow-md backdrop-blur-md dark:border-white/10"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Intensity</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the intensity panel"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </header>
      {children}
    </section>
  );
}
