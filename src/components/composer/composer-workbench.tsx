"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Brush, ChevronLeft, ChevronRight, CornerDownLeft, Layers, ListChecks, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  applyCompositionTo,
  compositionOf,
  compositionView,
  EMPTY_COMPOSITION,
  eraserOf,
  passChoice,
  tagCounts,
  toggleInComposition,
  withoutTags,
  presetOnto,
  presetAsComposition,
  type Composition,
  impliedTags,
  openDraft,
  pathByTag,
  unsavedChanges,
  toggleTag,
  findCombination,
  applyCombination,
  contextsOf,
  pathVisible,
  tileAspectOfGroup,
  type ComposerCatalog,
  type ComposerStateRule,
} from "@/lib/composer";
import { applyCompositionAction, ensureStateCombinationAction } from "@/lib/actions/composer-actions";
import type { ComposerCastMember, ComposerPhoto } from "@/lib/services/composer-service";
import {
  laneView,
  laneWrites,
  personalTagIds,
  personsDirty,
  photoDraftOf,
  toggleInLane,
  unattributed,
  type PersonTags,
} from "@/lib/composer-lanes";
import { ComposerPersonBar } from "./composer-person-bar";
import { ComposerInspector } from "./composer-inspector";
import { ComposerFilmstrip } from "./composer-filmstrip";
import { ComposerPass } from "./composer-pass";
import { ComposerCompositionBar } from "./composer-composition-bar";
import { ComposerPresetsMenu, type ComposerPresetItem } from "./composer-presets-menu";
import { ComposerCardContext, type ComposerCardContextValue } from "./composer-card-context";
import { DEFAULT_FRAMING, FRAMING, type TagExampleThumb } from "@/lib/tag-example";
import type { TileState } from "./composer-tile";

export type ComposerWorkbenchProps = {
  catalog: ComposerCatalog;
  title: string;
  backHref: string;
  photos: ComposerPhoto[];
  /** Everyone the photos show (ADR-0043 person lanes) */
  cast?: ComposerCastMember[];
  initialPhotoId: string | null;
  /** Saved compositions (S6) */
  presets: ComposerPresetItem[];
};

const PIN_KEY = "composer.pinned";

/** Where the user is leaving to: another photo, or out of the workbench */
type LeaveTarget = { kind: "photo"; index: number } | { kind: "back" };

const sameAsk = (a: LeaveTarget | null, b: LeaveTarget) =>
  !!a && a.kind === b.kind && (a.kind === "back" || (b.kind === "photo" && a.index === b.index));

function readPins(catalog: ComposerCatalog): Set<string> {
  try {
    const raw = window.localStorage.getItem(PIN_KEY);
    if (raw) {
      const names = JSON.parse(raw) as string[];
      return new Set(catalog.paths.filter((p) => names.includes(p.name)).map((p) => p.id));
    }
  } catch {
    // storage blocked — fall back to the catalogue's defaults
  }
  return new Set(catalog.paths.filter((p) => p.pinned).map((p) => p.id));
}

/**
 * The tag workbench (ADR-0042): one photo big, the Composer beside it, the set
 * along the bottom. Enter writes the draft and moves on; → moves on without
 * writing; ← goes back; 1–4 switch paths; Esc leaves. Pinned paths carry the
 * last written tags over to the next photo as a proposal.
 *
 * Many photos at once (S3): Ctrl/⌘- or Shift-click in the filmstrip selects —
 * tiles then count ("12/30") and clicks build one composition, applied with
 * Enter; Paint turns the same composition into a brush for the filmstrip (Alt
 * erases); Pass walks one section photo by photo with keys 1–9.
 */
export function ComposerWorkbench({ catalog: initialCatalog, title, backHref, photos, cast = [], initialPhotoId, presets: initialPresets }: ComposerWorkbenchProps) {
  const router = useRouter();
  const [catalog, setCatalog] = useState(initialCatalog);
  const [own, setOwn] = useState<Record<string, string[]>>(() => Object.fromEntries(photos.map((p) => [p.id, p.tagIds])));
  const [index, setIndex] = useState(() => Math.max(0, photos.findIndex((p) => p.id === initialPhotoId)));
  const [pinned, setPinned] = useState<Set<string>>(() => new Set(initialCatalog.paths.filter((p) => p.pinned).map((p) => p.id)));
  const [lastWritten, setLastWritten] = useState<string[]>([]);
  const [activePathId, setActivePathId] = useState(initialCatalog.paths[0]?.id ?? "");
  const [creating, setCreating] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(0);
  /** Where the user wanted to go while this photo had unwritten changes — asked once */
  const [leaveAsk, setLeaveAsk] = useState<LeaveTarget | null>(null);
  /** S3: a selection in the filmstrip, the brush, the pass */
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [painting, setPainting] = useState(false);
  const [passSectionId, setPassSectionId] = useState<string | null>(null);
  const [comp, setComp] = useState<Composition>(EMPTY_COMPOSITION);
  const [applying, setApplying] = useState(false);
  const [presets, setPresets] = useState(initialPresets);
  /** ADR-0043: what each photo holds per person, the current photo's drafts per person, the lane described */
  const [ownPersons, setOwnPersons] = useState<Record<string, PersonTags>>(() => Object.fromEntries(photos.map((p) => [p.id, p.persons])));
  const [personDrafts, setPersonDrafts] = useState<PersonTags>(() => {
    const p = photos[Math.max(0, photos.findIndex((x) => x.id === initialPhotoId))];
    return p && p.shownPersonIds.length >= 2 ? Object.fromEntries(p.shownPersonIds.map((id) => [id, p.persons[id] ?? []])) : {};
  });
  const [lane, setLane] = useState<string | null>(() => {
    const p = photos[Math.max(0, photos.findIndex((x) => x.id === initialPhotoId))];
    return p && p.shownPersonIds.length >= 2 ? p.shownPersonIds[0] : null;
  });

  const photo = photos[index];
  const [draftState, setDraftState] = useState(() =>
    openDraft(initialCatalog, photo ? photos[index].tagIds : [], [], new Set()),
  );
  const { draft, proposed } = draftState;

  // Pins come from this browser once mounted (no hydration mismatch)
  useEffect(() => {
    setPinned(readPins(initialCatalog));
  }, [initialCatalog]);

  const byPath = useMemo(() => pathByTag(catalog), [catalog]);
  const personal = useMemo(() => personalTagIds(catalog), [catalog]);
  const castById = useMemo(() => new Map(cast.map((c) => [c.id, c])), [cast]);

  const bulk = selected.size >= 2 && !painting && !passSectionId;
  const compMode = bulk || painting;
  const counts = useMemo(
    () => (bulk ? tagCounts([...selected].map((id) => own[id] ?? [])) : new Map<string, number>()),
    [bulk, selected, own],
  );
  const total = bulk ? selected.size : 0;
  // ADR-0043: the paths the photo's contexts leave open (a macro shot has no Expression)
  // ADR-0043 person lanes: a duo is described one person at a time (selection, brush and pass stay on the photo)
  const shownIds = useMemo(() => photo?.shownPersonIds ?? [], [photo]);
  const duo = shownIds.length >= 2 && !compMode && !passSectionId && !!lane;
  const ownHere = useMemo(() => (photo ? (own[photo.id] ?? []) : []), [own, photo]);
  const ownPersonsHere = useMemo(() => (photo ? (ownPersons[photo.id] ?? {}) : {}), [ownPersons, photo]);
  /** Tags written before lanes (no attribution) that nobody in the drafts has taken yet */
  const waiting = useMemo(() => {
    if (shownIds.length < 2) return [];
    const given = new Set(Object.values(personDrafts).flat());
    return unattributed(personal, ownHere, ownPersonsHere).filter((id) => !given.has(id));
  }, [shownIds, personDrafts, personal, ownHere, ownPersonsHere]);
  const laneDraft = useMemo(() => (duo && lane ? (personDrafts[lane] ?? []) : []), [duo, lane, personDrafts]);
  const viewDraft = useMemo(
    () => (compMode ? compositionView(comp, counts) : duo ? [...laneView(personal, draft, laneDraft), ...waiting] : draft),
    [compMode, comp, counts, duo, personal, draft, laneDraft, waiting],
  );
  const visiblePaths = useMemo(() => {
    const ctx = contextsOf(catalog, viewDraft);
    return catalog.paths.filter((p) => pathVisible(catalog, ctx, p.id));
  }, [catalog, viewDraft]);

  const open = useCallback(
    (i: number, ownMap: Record<string, string[]>, written: string[], personsMap: Record<string, PersonTags> = ownPersons) => {
      const target = photos[i];
      if (!target) return;
      setIndex(i);
      setLeaveAsk(null);
      const duo = target.shownPersonIds.length >= 2;
      const mine = personsMap[target.id] ?? {};
      setPersonDrafts(duo ? Object.fromEntries(target.shownPersonIds.map((id) => [id, mine[id] ?? []])) : {});
      setLane((cur) => (duo ? (cur && target.shownPersonIds.includes(cur) ? cur : target.shownPersonIds[0]) : null));
      setDraftState(openDraft(catalog, ownMap[target.id] ?? [], written, pinned));
      const url = new URL(window.location.href);
      url.searchParams.set("photo", target.id);
      window.history.replaceState(null, "", url);
    },
    [catalog, photos, pinned, ownPersons],
  );

  const toggle = useCallback(
    (tagId: string, additive: boolean) => {
      if (compMode) return setComp((c) => toggleInComposition(catalog, c, tagId, counts, total, additive));
      if (duo && lane && personal.has(tagId)) {
        // The person's own draft; the photo's draft is everyone's together
        const next = { ...personDrafts, [lane]: toggleInLane(catalog, personal, draft, personDrafts[lane] ?? [], tagId, additive).personDraft };
        setPersonDrafts(next);
        const stillWaiting = unattributed(personal, ownHere, ownPersonsHere).filter((id) => !Object.values(next).flat().includes(id));
        return setDraftState((s) => ({ draft: photoDraftOf(personal, s.draft, stillWaiting, next), proposed: s.proposed.filter((id) => id !== tagId) }));
      }
      setDraftState((s) => ({ draft: toggleTag(catalog, s.draft, tagId, additive), proposed: s.proposed.filter((id) => id !== tagId) }));
    },
    [catalog, compMode, counts, total, duo, lane, personal, personDrafts, draft, ownHere, ownPersonsHere],
  );

  const takeCombination = useCallback(
    (comboId: string) => {
      if (duo && lane) {
        const next = { ...personDrafts, [lane]: applyCombination(catalog, personDrafts[lane] ?? [], comboId) };
        setPersonDrafts(next);
        const stillWaiting = unattributed(personal, ownHere, ownPersonsHere).filter((id) => !Object.values(next).flat().includes(id));
        return setDraftState((s) => ({ draft: photoDraftOf(personal, s.draft, stillWaiting, next), proposed: s.proposed }));
      }
      setDraftState((s) => ({ draft: applyCombination(catalog, s.draft, comboId), proposed: s.proposed.filter((id) => id !== comboId) }));
    },
    [catalog, duo, lane, personDrafts, personal, ownHere, ownPersonsHere],
  );

  const onCombination = useCallback(
    (rule: ComposerStateRule, garmentId: string) => {
      const existing = findCombination(catalog, rule, garmentId);
      if (existing) return toggle(existing.id, false);
      const key = `${rule.stateGroupId}:${garmentId}`;
      setCreating(key);
      startTransition(async () => {
        const r = await ensureStateCombinationAction(rule.stateGroupId, garmentId);
        setCreating(null);
        if (!r.success) return void toast.error(r.error);
        const t = r.tag;
        setCatalog((c) => ({
          ...c,
          tags: { ...c.tags, [t.id]: t },
          groups: c.groups[t.groupId]?.tagIds.includes(t.id)
            ? c.groups
            : { ...c.groups, [t.groupId]: { ...c.groups[t.groupId], tagIds: [...c.groups[t.groupId].tagIds, t.id] } },
        }));
        if (compMode) setComp((c) => (c.adds.includes(t.id) ? c : { adds: [...c.adds, t.id], removes: c.removes.filter((x) => x !== t.id) }));
        else setDraftState((s) => ({ draft: s.draft.includes(t.id) ? s.draft : [...s.draft, t.id], proposed: s.proposed }));
      });
    },
    [catalog, toggle, compMode],
  );

  /**
   * Write new tag lists for photos (pass, paint): optimistic, one request per
   * distinct change, the server's answer wins, a failure puts the photo back.
   */
  const writePhotos = useCallback(
    (updates: Record<string, string[]>, ownNow: Record<string, string[]>) => {
      const groups = new Map<string, { comp: Composition; ids: string[] }>();
      for (const [id, tags] of Object.entries(updates)) {
        const c = compositionOf(ownNow[id] ?? [], tags);
        if (!c.adds.length && !c.removes.length) continue;
        const key = JSON.stringify(c);
        const g = groups.get(key) ?? { comp: c, ids: [] };
        g.ids.push(id);
        groups.set(key, g);
      }
      if (groups.size === 0) return ownNow;
      const nextOwn = { ...ownNow, ...updates };
      setOwn(nextOwn);
      for (const { comp: c, ids } of groups.values()) {
        setSaving((n) => n + 1);
        void applyCompositionAction(ids, c.adds, c.removes).then((r) => {
          setSaving((n) => n - 1);
          if (!r.success) {
            toast.error(r.error);
            setOwn((o) => ({ ...o, ...Object.fromEntries(ids.map((id) => [id, ownNow[id] ?? []])) }));
          } else {
            setOwn((o) => ({ ...o, ...r.tags }));
            setOwnPersons((o) => ({ ...o, ...r.persons }));
          }
        });
      }
      return nextOwn;
    },
    [],
  );

  /**
   * Run a photo's writes in order (photo level first, then each person's) —
   * optimistic; the last answer of the server wins, a failure puts the photo back.
   */
  const runWrites = useCallback(
    (id: string, filename: string, writes: { personId: string | null; adds: string[]; removes: string[] }[], before: { tags: string[]; persons: PersonTags }) => {
      if (writes.length === 0) return;
      setSaving((n) => n + 1);
      void (async () => {
        let last: { tags: Record<string, string[]>; persons: Record<string, PersonTags> } | null = null;
        for (const w of writes) {
          const r = await applyCompositionAction([id], w.adds, w.removes, w.personId);
          if (!r.success) {
            toast.error(`${filename}: ${r.error}`);
            setOwn((o) => ({ ...o, [id]: before.tags }));
            setOwnPersons((o) => ({ ...o, [id]: before.persons }));
            setSaving((n) => n - 1);
            return;
          }
          last = r;
        }
        setSaving((n) => n - 1);
        if (last) {
          const done = last;
          setOwn((o) => ({ ...o, [id]: done.tags[id] ?? o[id] }));
          setOwnPersons((o) => ({ ...o, [id]: done.persons[id] ?? o[id] }));
        }
      })();
    },
    [],
  );

  /** Enter: write what changed, remember it for carry-over, go on — to the next photo, or where the user was leaving to */
  const applyAndNext = useCallback(() => {
    if (!photo) return;
    const target = leaveAsk;
    const before = { tags: own[photo.id] ?? [], persons: ownPersons[photo.id] ?? {} };
    const shown = photo.shownPersonIds;
    const writes = laneWrites(catalog, { own: before.tags, ownPersons: before.persons, draft, personDrafts, shown });
    const written = draft;
    const nextOwn = { ...own, [photo.id]: draft };
    const nextPersons = {
      ...ownPersons,
      [photo.id]:
        shown.length >= 2
          ? { ...before.persons, ...personDrafts }
          : shown.length === 1
            ? { ...before.persons, [shown[0]]: draft.filter((id) => personal.has(id)) }
            : before.persons,
    };
    setLastWritten(written);
    if (writes.length) {
      setOwn(nextOwn);
      setOwnPersons(nextPersons);
      runWrites(photo.id, photo.filename, writes, before);
    }
    if (target?.kind === "back") return void router.push(backHref);
    if (target?.kind === "photo") return void open(target.index, nextOwn, written, nextPersons);
    if (index < photos.length - 1) open(index + 1, nextOwn, written, nextPersons);
    else {
      setDraftState({ draft, proposed: [] });
      toast.success("Last photo — all written");
    }
  }, [photo, own, ownPersons, draft, personDrafts, catalog, personal, index, photos.length, open, leaveAsk, router, backHref, runWrites]);

  // Unwritten work on this photo: leaving asks once — the same move again discards
  const unsaved = photo ? unsavedChanges(own[photo.id] ?? [], draft, proposed) : { adds: [], removes: [] };
  const lanesDirty = shownIds.length >= 2 && personsDirty(ownPersonsHere, personDrafts);
  const dirty = unsaved.adds.length + unsaved.removes.length > 0 || lanesDirty;
  const leaveTo = useCallback(
    (target: LeaveTarget) => {
      if (dirty && !sameAsk(leaveAsk, target)) return setLeaveAsk(target);
      if (target.kind === "back") router.push(backHref);
      else open(target.index, own, lastWritten);
    },
    [dirty, leaveAsk, router, backHref, open, own, lastWritten],
  );
  const next = useCallback(() => index < photos.length - 1 && leaveTo({ kind: "photo", index: index + 1 }), [index, photos.length, leaveTo]);
  const prev = useCallback(() => index > 0 && leaveTo({ kind: "photo", index: index - 1 }), [index, leaveTo]);

  // Closing or reloading the tab with unwritten work (or a write still on its way)
  useEffect(() => {
    if (!dirty && saving === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, saving]);

  const togglePin = useCallback(
    (pathId: string) => {
      setPinned((p) => {
        const n = new Set(p);
        if (n.has(pathId)) n.delete(pathId);
        else n.add(pathId);
        try {
          window.localStorage.setItem(PIN_KEY, JSON.stringify(catalog.paths.filter((x) => n.has(x.id)).map((x) => x.name)));
        } catch {
          // storage blocked — the pin holds for this visit
        }
        return n;
      });
    },
    [catalog.paths],
  );

  // ── S3: selection, brush, pass ─────────────────────────────────────────────

  const selectedInOrder = useMemo(() => photos.filter((p) => selected.has(p.id)).map((p) => p.id), [photos, selected]);

  const onSelect = useCallback(
    (i: number, how: "toggle" | "range") => {
      setPassSectionId(null);
      setSelected((sel) => {
        if (how === "range") {
          const [a, b] = [Math.min(index, i), Math.max(index, i)];
          return new Set(photos.slice(a, b + 1).map((p) => p.id));
        }
        const n = new Set(sel.size === 0 ? [photos[index].id] : sel);
        const id = photos[i].id;
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      });
    },
    [index, photos],
  );

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setComp(EMPTY_COMPOSITION);
  }, []);

  const applyToSelection = useCallback(() => {
    if (!bulk || (!comp.adds.length && !comp.removes.length)) return;
    const ids = selectedInOrder;
    const before = Object.fromEntries(ids.map((id) => [id, own[id] ?? []]));
    setOwn((o) => ({ ...o, ...Object.fromEntries(ids.map((id) => [id, applyCompositionTo(catalog, o[id] ?? [], comp)])) }));
    setApplying(true);
    void applyCompositionAction(ids, comp.adds, comp.removes).then((r) => {
      setApplying(false);
      if (!r.success) {
        toast.error(r.error);
        setOwn((o) => ({ ...o, ...before }));
        return;
      }
      setOwn((o) => ({ ...o, ...r.tags }));
      setOwnPersons((o) => ({ ...o, ...r.persons }));
      setComp(EMPTY_COMPOSITION);
      toast.success(`Written on ${ids.length} photos`);
    });
  }, [bulk, comp, selectedInOrder, own, catalog]);

  const onStroke = useCallback(
    (ids: string[], erase: boolean) => {
      if (!comp.adds.length && !comp.removes.length) return void toast.info("Pick tags for the brush first");
      const brush = erase ? eraserOf(comp) : comp;
      const updates: Record<string, string[]> = {};
      for (const id of ids) {
        let tags = withoutTags(catalog, own[id] ?? [], brush.removes);
        for (const a of brush.adds) if (!tags.includes(a)) tags = toggleTag(catalog, tags, a, false);
        updates[id] = tags;
      }
      writePhotos(updates, own);
    },
    [comp, catalog, own, writePhotos],
  );

  const passSections = useMemo(
    () => catalog.paths.flatMap((p) => p.sections.filter((s) => s.passable).map((section) => ({ section, pathName: p.name }))),
    [catalog.paths],
  );
  const passSection = passSections.find((s) => s.section.id === passSectionId)?.section ?? null;
  const passTagIds = useMemo(
    () => (passSection ? passSection.groupIds.flatMap((g) => catalog.groups[g]?.tagIds ?? []) : []),
    [passSection, catalog.groups],
  );

  const passWrite = useCallback(
    (tags: string[]) => {
      if (!photo) return;
      const nextOwn = writePhotos({ [photo.id]: tags }, own);
      if (index < photos.length - 1) open(index + 1, nextOwn, lastWritten);
      else toast.success("Last photo — pass done");
    },
    [photo, own, writePhotos, index, photos.length, open, lastWritten],
  );
  const passChoose = useCallback(
    (tagId: string) => photo && passWrite(passChoice(catalog, own[photo.id] ?? [], new Set(passTagIds), tagId)),
    [photo, passWrite, catalog, own, passTagIds],
  );
  const passClear = useCallback(
    () => photo && passWrite(withoutTags(catalog, own[photo.id] ?? [], passTagIds)),
    [photo, passWrite, catalog, own, passTagIds],
  );

  const startPass = useCallback(() => {
    setPainting(false);
    setSelected(new Set());
    setComp(EMPTY_COMPOSITION);
    setPassSectionId((cur) => (cur ? null : (passSections[0]?.section.id ?? null)));
  }, [passSections]);
  const startPaint = useCallback(() => {
    setPassSectionId(null);
    setSelected(new Set());
    setComp(EMPTY_COMPOSITION);
    setPainting((p) => !p);
  }, []);

  /** A preset (S6): onto the photo's draft, or as the selection's change / the brush */
  const applyPreset = useCallback(
    (p: ComposerPresetItem) => {
      // Played as clicks, so a base posture or an exclusive tag replaces as it would
      if (compMode) return setComp(painting ? { adds: p.adds.filter((id) => catalog.tags[id]), removes: p.removes.filter((id) => catalog.tags[id]) } : presetAsComposition(catalog, p, counts, total));
      setDraftState((s) => ({ draft: presetOnto(catalog, s.draft, p), proposed: s.proposed.filter((id) => !p.adds.includes(id)) }));
    },
    [catalog, compMode, painting, counts, total],
  );

  // Keyboard: the workbench is a keyboard tool
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      // A popover or dialog of its own (presets, a tag's card, the example frame) keeps its keys:
      // Esc there closes it, it does not leave the workbench
      if (el?.closest('[role="dialog"], [data-radix-popper-content-wrapper]')) return;
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (passSectionId) {
        if (/^[1-9]$/.test(e.key)) {
          const t = passTagIds[Number(e.key) - 1];
          if (t) passChoose(t);
        } else if (e.key === "0") passClear();
        else if (e.key === "ArrowRight" || e.key === " ") {
          e.preventDefault();
          if (index < photos.length - 1) open(index + 1, own, lastWritten);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          if (index > 0) open(index - 1, own, lastWritten);
        } else if (e.key === "Escape") setPassSectionId(null);
        return;
      }
      if (painting) {
        if (e.key === "Escape") setPainting(false);
        return;
      }
      if (bulk) {
        if (e.key === "Enter") {
          e.preventDefault();
          applyToSelection();
        } else if (e.key === "Escape") clearSelection();
        else if (/^[1-9]$/.test(e.key)) {
          const p = visiblePaths[Number(e.key) - 1];
          if (p) setActivePathId(p.id);
        }
        return;
      }
      if ((e.key === "[" || e.key === "]") && duo && lane) {
        const i = shownIds.indexOf(lane);
        const n = shownIds.length;
        setLane(shownIds[(i + (e.key === "]" ? 1 : n - 1)) % n]);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        applyAndNext();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "Escape") {
        leaveTo({ kind: "back" });
      } else if (/^[1-9]$/.test(e.key)) {
        const p = visiblePaths[Number(e.key) - 1];
        if (p) setActivePathId(p.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyAndNext, next, prev, leaveTo, visiblePaths, passSectionId, passTagIds, passChoose, passClear, index, photos.length, open, own, lastWritten, painting, bulk, applyToSelection, clearSelection, duo, lane, shownIds]);

  const implied = useMemo(() => new Set(impliedTags(catalog, duo ? laneView(personal, draft, laneDraft) : draft)), [catalog, duo, personal, draft, laneDraft]);
  const laneSet = useMemo(() => new Set(laneDraft), [laneDraft]);
  const waitingSet = useMemo(() => new Set(waiting), [waiting]);
  const proposedSet = useMemo(() => new Set(proposed), [proposed]);
  const draftSet = useMemo(() => new Set(draft), [draft]);
  const addSet = useMemo(() => new Set(comp.adds), [comp.adds]);
  const removeSet = useMemo(() => new Set(comp.removes), [comp.removes]);
  const tileState = useCallback(
    (id: string): TileState => {
      if (compMode) {
        if (addSet.has(id)) return "add";
        if (removeSet.has(id)) return "remove";
        const n = counts.get(id) ?? 0;
        return total > 0 && n === total ? "on" : n > 0 ? "partial" : "off";
      }
      if (duo && personal.has(id))
        // A person's lane: hers on, implied faint, a tag written before lanes grey until given to someone
        return laneSet.has(id) ? "on" : waitingSet.has(id) ? "partial" : implied.has(id) ? "implied" : "off";
      return proposedSet.has(id) ? "proposed" : draftSet.has(id) ? "on" : implied.has(id) ? "implied" : "off";
    },
    [compMode, addSet, removeSet, counts, total, proposedSet, draftSet, implied, duo, personal, laneSet, waitingSet],
  );
  // The tag cards (S4): the photo on screen, each tag's tile shape, and tile images that change
  const cardContext = useMemo<ComposerCardContextValue>(
    () => ({
      photo: photo ? { id: photo.id, viewUrl: photo.viewUrl, width: photo.width, height: photo.height, filename: photo.filename } : null,
      tileAspectOf: (tagId: string) => tileAspectOfGroup(catalog, catalog.tags[tagId]?.groupId ?? ""),
      // A facet's own framing (ADR-0043) over its path's rule: Feet frames the feet
      framingOf: (tagId: string) => {
        const base = FRAMING[catalog.paths.find((p) => p.id === byPath.get(tagId))?.name ?? ""] ?? DEFAULT_FRAMING;
        const own = catalog.groups[catalog.tags[tagId]?.groupId ?? ""]?.framing;
        return { fill: own?.fill ?? base.fill, topMargin: own?.top ?? base.topMargin };
      },
      onTitleChanged: (tagId: string, example: TagExampleThumb | null) =>
        setCatalog((c) => (c.tags[tagId] ? { ...c, tags: { ...c.tags, [tagId]: { ...c.tags[tagId], example } } } : c)),
    }),
    [photo, catalog, byPath],
  );

  const countOf = useCallback((id: string) => (bulk ? { n: counts.get(id) ?? 0, of: total } : undefined), [bulk, counts, total]);

  const coverage = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    for (const p of photos) out[p.id] = new Set((own[p.id] ?? []).map((t) => byPath.get(t)).filter((x): x is string => !!x));
    return out;
  }, [photos, own, byPath]);

  const countByPath = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of duo ? laneView(personal, draft, laneDraft) : draft) {
      const p = byPath.get(t);
      if (p) out[p] = (out[p] ?? 0) + 1;
    }
    return out;
  }, [duo, personal, draft, laneDraft, byPath]);

  /** What Enter would change — per person in a duo ("Anna: + kneeling") */
  const pending = useMemo(() => {
    if (!photo) return [] as { key: string; text: string; kind: "add" | "remove"; offered: boolean }[];
    const label = (pid: string | null, id: string, sign: string) => {
      const who = pid ? castById.get(pid)?.name : null;
      return `${who ? `${who}: ` : ""}${sign} ${catalog.tags[id]?.name ?? "?"}`;
    };
    if (shownIds.length < 2) {
      const c = compositionOf(ownHere, draft);
      return [
        ...c.adds.map((id) => ({ key: `+${id}`, text: label(null, id, "+"), kind: "add" as const, offered: proposed.includes(id) })),
        ...c.removes.map((id) => ({ key: `-${id}`, text: label(null, id, "−"), kind: "remove" as const, offered: false })),
      ];
    }
    const out: { key: string; text: string; kind: "add" | "remove"; offered: boolean }[] = [];
    const photoLevel = compositionOf(ownHere.filter((id) => !personal.has(id)), draft.filter((id) => !personal.has(id)));
    for (const id of photoLevel.adds) out.push({ key: `+${id}`, text: label(null, id, "+"), kind: "add", offered: proposed.includes(id) });
    for (const id of photoLevel.removes) out.push({ key: `-${id}`, text: label(null, id, "−"), kind: "remove", offered: false });
    for (const pid of shownIds) {
      const c = compositionOf(ownPersonsHere[pid] ?? [], personDrafts[pid] ?? []);
      for (const id of c.adds) out.push({ key: `${pid}+${id}`, text: label(pid, id, "+"), kind: "add", offered: false });
      for (const id of c.removes) out.push({ key: `${pid}-${id}`, text: label(pid, id, "−"), kind: "remove", offered: false });
    }
    return out;
  }, [photo, shownIds, ownHere, draft, proposed, personal, ownPersonsHere, personDrafts, catalog, castById]);
  const laneCounts = useMemo(
    () => Object.fromEntries(Object.entries(personDrafts).map(([pid, t]) => [pid, t.length])),
    [personDrafts],
  );

  const name = (id: string) => catalog.tags[id]?.name ?? "?";

  if (!photo)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No photos here yet. <Link href={backHref} className="text-primary hover:underline">Back</Link>
      </div>
    );

  return (
    <ComposerCardContext.Provider value={cardContext}>
    <div ref={shellRef} className="flex h-[calc(100dvh-4rem)] flex-col" data-testid="composer-workbench">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 text-sm">
        <Link
          href={backHref}
          onClick={(e) => {
            if (!dirty || sameAsk(leaveAsk, { kind: "back" })) return;
            e.preventDefault();
            setLeaveAsk({ kind: "back" });
          }}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} /> Back
        </Link>
        <span className="min-w-0 truncate font-medium">{title}</span>
        <span className="text-muted-foreground tabular-nums" data-testid="composer-position">
          {index + 1} / {photos.length}
        </span>
        <span className="hidden truncate text-xs text-muted-foreground md:inline" title={photo.filename}>
          {photo.filename}
        </span>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
          {saving > 0 && (
            <>
              <Loader2 size={12} className="animate-spin" /> saving
            </>
          )}
        </span>
        <div className="flex items-center gap-1">
          {!passSectionId && (
            <ComposerPresetsMenu
              presets={presets}
              onPresetsChange={setPresets}
              current={compMode ? comp : { adds: draft, removes: [] }}
              target={painting ? "paint" : bulk ? "selection" : "photo"}
              name={name}
              onUse={applyPreset}
            />
          )}
          <Button
            variant={passSectionId ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={startPass}
            aria-pressed={!!passSectionId}
            data-testid="composer-pass-toggle"
            title="One section, photo by photo — a key per photo"
          >
            <ListChecks size={14} /> Pass
          </Button>
          <Button
            variant={painting ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={startPaint}
            aria-pressed={painting}
            data-testid="composer-paint-toggle"
            title="Pick tags, then drag over the filmstrip — Alt erases"
          >
            <Brush size={14} /> Paint
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative flex min-h-[35vh] flex-1 items-center justify-center bg-black/80 lg:min-h-0">
          {photo.viewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- MinIO URL
            <img src={photo.viewUrl} alt={photo.filename} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-sm text-white/60">No preview</span>
          )}
          <button
            type="button"
            onClick={prev}
            disabled={index === 0}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-opacity hover:bg-black/70 disabled:opacity-0"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={next}
            disabled={index === photos.length - 1}
            aria-label="Next photo without writing"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-opacity hover:bg-black/70 disabled:opacity-0"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <aside className="flex min-h-0 flex-col border-t border-border/60 bg-card/80 backdrop-blur-md lg:w-[30rem] lg:border-l lg:border-t-0">
          {bulk && (
            <div className="flex items-center gap-2 border-b border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs" data-testid="composer-selection-banner">
              <Layers size={14} className="shrink-0 text-sky-600 dark:text-sky-300" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{selected.size} photos selected</span> — tiles show how many have each tag; clicks build one change. Enter
                applies · Esc clears
              </span>
              <button type="button" onClick={clearSelection} aria-label="Clear selection" className="rounded p-0.5 hover:bg-sky-500/20">
                <X size={14} />
              </button>
            </div>
          )}
          {painting && (
            <div className="flex items-center gap-2 border-b border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs" data-testid="composer-paint-banner">
              <Brush size={14} className="shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="font-medium">Paint</span> — pick tags, then drag over the filmstrip. Alt-drag erases. Esc ends.
              </span>
            </div>
          )}
          {passSectionId ? (
            <ComposerPass
              catalog={catalog}
              sections={passSections}
              sectionId={passSectionId}
              onSection={setPassSectionId}
              tagIds={passTagIds}
              own={own[photo.id] ?? []}
              onChoose={passChoose}
              tileAspect={catalog.paths.find((p) => p.sections.some((x) => x.id === passSectionId))?.tileAspect}
            />
          ) : (
            <>
            {duo && lane && (
              <ComposerPersonBar
                persons={shownIds.map((id) => castById.get(id)).filter((c): c is ComposerCastMember => !!c)}
                laneId={lane}
                onLane={setLane}
                counts={laneCounts}
                waiting={waiting.length}
              />
            )}
            <ComposerInspector
              key={`${photo.id}:${lane ?? ""}`}
              catalog={catalog}
              paths={visiblePaths}
              activePathId={activePathId}
              onPath={setActivePathId}
              pinned={pinned}
              onPin={togglePin}
              draft={viewDraft}
              tileState={tileState}
              onToggle={toggle}
              onCombination={onCombination}
              onTakeCombination={compMode ? null : takeCombination}
              creating={creating}
              countByPath={countByPath}
              countOf={countOf}
              composing={compMode}
            />
            </>
          )}

          {compMode ? (
            <ComposerCompositionBar
              mode={painting ? "paint" : "selection"}
              comp={comp}
              count={selected.size}
              name={name}
              busy={applying}
              onApply={applyToSelection}
              onClear={() => setComp(EMPTY_COMPOSITION)}
            />
          ) : passSectionId ? null : (
          <footer className="space-y-2 border-t border-border/60 p-3">
            {leaveAsk && dirty && (
              <div
                role="alert"
                data-testid="composer-unsaved"
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200"
              >
                <AlertTriangle size={14} aria-hidden className="shrink-0" />
                <span className="min-w-0 flex-1">
                  Not written: {pending.filter((x) => !x.offered).map((x) => x.text).join(" · ")}.{" "}
                  <span className="text-amber-700/80 dark:text-amber-300/80">
                    <kbd className="font-medium">Enter</kbd> writes · {leaveAsk.kind === "back" ? "Back / Esc" : "the same move"} again discards
                  </span>
                </span>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => leaveTo(leaveAsk)} data-testid="composer-discard">
                  Discard
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setLeaveAsk(null)}>
                  Stay
                </Button>
              </div>
            )}
            <div className="flex min-h-[1.5rem] flex-wrap items-center gap-1 text-[11px]" data-testid="composer-diff" aria-live="polite">
              {pending.length === 0 ? (
                <span className="text-muted-foreground">No changes on this photo</span>
              ) : (
                pending.map((x) => (
                  <span
                    key={x.key}
                    className={cn(
                      "rounded-full border px-1.5 py-0.5",
                      x.kind === "remove"
                        ? "border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                        : x.offered
                          ? "border-dashed border-emerald-500/60 text-emerald-700 dark:text-emerald-300"
                          : "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                    )}
                    title={x.offered ? "Carried over from the last photo" : undefined}
                  >
                    {x.text}
                  </span>
                ))
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={prev} disabled={index === 0} className="gap-1">
                <ChevronLeft size={14} /> Prev
              </Button>
              <Button variant="outline" size="sm" onClick={next} disabled={index === photos.length - 1} className="gap-1" data-testid="composer-skip">
                Skip <ChevronRight size={14} />
              </Button>
              <Button size="sm" onClick={applyAndNext} className="ml-auto gap-1.5" data-testid="composer-apply">
                <CornerDownLeft size={14} />
                {pending.length ? "Apply & next" : "Next"}
              </Button>
            </div>
          </footer>
          )}
        </aside>
      </div>

      <ComposerFilmstrip
        photos={photos}
        paths={catalog.paths}
        coverage={coverage}
        currentIndex={index}
        onJump={(i) => {
          if (passSectionId) return open(i, own, lastWritten);
          if (selected.size) setSelected(new Set());
          if (i !== index) leaveTo({ kind: "photo", index: i });
        }}
        selected={selected}
        onSelect={onSelect}
        painting={painting}
        onStroke={onStroke}
      />
    </div>
    </ComposerCardContext.Provider>
  );
}
