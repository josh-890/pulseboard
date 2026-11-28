"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { applyActToPhotosAction, undoApplyActToPhotosAction, unlinkActFromPhotosAction } from "@/lib/actions/intensity-actions";
import { imageShownIds } from "@/lib/image-shown";
import { suggestScenarioIds } from "@/lib/intensity";
import type { GalleryItem } from "@/lib/types";
import type { GalleryCastMember } from "@/lib/types/gallery";
import { actKey, type PhotoIntensityData, type PhotoLead } from "./photo-intensity";

/** Who a photo shows, as far as intensity goes */
export type PeopleOnPhoto = {
  /** Its session — null when the gallery does not know it */
  sessionId: string | null;
  /** The leads it shows: an act can be recorded for them */
  leads: PhotoLead[];
  /** Others it shows (only appearing): they count for the scenario, carry no intensity */
  others: { id: string; label: string }[];
};

export type ActState = "all" | "some" | "none";

// The intensity of the photos in hand (2026-11-28), shared by the viewer and a
// gallery selection: shown at once, saved behind — the server's copy wins
// whenever it changes (a save here, the panel, another tab). Picking an act
// ticks it for the chosen people where missing and links the photos.
export function usePhotoIntensity(
  data: PhotoIntensityData | undefined,
  { cast, sessionId: fallbackSessionId }: { cast: GalleryCastMember[]; sessionId?: string },
) {
  const [seen, setSeen] = useState(data);
  const [ticks, setTicks] = useState<Set<string>>(() => ticksOf(data));
  const [evidence, setEvidence] = useState<Record<string, string[]>>(data?.evidence ?? {});
  // The people last picked — kept while paging, where they are on the photo
  const [picked, setPicked] = useState<string[]>([]);
  const [, startTransition] = useTransition();
  if (seen !== data) {
    setSeen(data);
    setTicks(ticksOf(data));
    setEvidence(data?.evidence ?? {});
  }

  const castById = useMemo(() => new Map(cast.map((c) => [c.id, c])), [cast]);
  const actById = useMemo(
    () => new Map((data?.catalog.scenarios ?? []).flatMap((s) => s.acts.map((a) => [a.id, { ...a, scenarioId: s.id, scenarioName: s.name }] as const))),
    [data],
  );

  const peopleOn = useCallback(
    (item: GalleryItem): PeopleOnPhoto => {
      const sessionId = item.sessionId ?? fallbackSessionId ?? null;
      const leads = (sessionId && data?.sessions[sessionId]) || [];
      // Without per-photo cast the gallery shows every lead
      const shown = item.sessionCastIds ? new Set(imageShownIds(item)) : null;
      const visible = shown ? leads.filter((l) => shown.has(l.personId)) : leads;
      const leadIds = new Set(leads.map((l) => l.personId));
      const others = shown
        ? [...shown]
            .filter((id) => !leadIds.has(id))
            .map((id) => {
              const c = castById.get(id);
              return { id, label: c ? `${c.name}${c.icgId ? ` (${c.icgId})` : ""}` : id };
            })
        : [];
      return { sessionId, leads: visible, others };
    },
    [data, fallbackSessionId, castById],
  );

  /** The scenario the photo suggests — from who is on it, not the session's cast */
  const suggestedScenarioId = useCallback(
    (item: GalleryItem, forPersonId?: string): string | null => {
      const on = peopleOn(item);
      const sexes = [
        ...on.leads.map((l) => ({ id: l.personId, sex: l.sexAtBirth })),
        ...on.others.map((o) => ({ id: o.id, sex: castById.get(o.id)?.sexAtBirth ?? null })),
      ];
      if (sexes.length === 0) return null;
      const self = sexes.find((s) => s.id === forPersonId) ?? sexes[0]!;
      const ids = suggestScenarioIds(
        self.sex,
        sexes.filter((s) => s !== self).map((s) => s.sex),
      );
      return ids.find((id) => data?.catalog.scenarios.some((s) => s.id === id)) ?? null;
    },
    [peopleOn, castById, data],
  );

  /** Whom an act goes to on this photo: the last picked who are on it, else the only lead, else the first */
  const chosenOn = useCallback(
    (item: GalleryItem): string[] => {
      const leads = peopleOn(item).leads.map((l) => l.personId);
      const kept = picked.filter((id) => leads.includes(id));
      if (kept.length) return kept;
      return leads.slice(0, 1);
    },
    [peopleOn, picked],
  );

  const leadsOf = useCallback(
    (items: GalleryItem[], personIds: string[]) =>
      items.flatMap((item) => peopleOn(item).leads.filter((l) => personIds.includes(l.personId)).map((l) => ({ item, lead: l }))),
    [peopleOn],
  );

  /** Whether the chosen people have the act ticked, and the photos as its evidence */
  const stateAt = useCallback(
    (items: GalleryItem[], personIds: string[], actId: string): { ticked: ActState; linked: ActState } => {
      const pairs = leadsOf(items, personIds);
      const of = (n: number): ActState => (n === 0 ? "none" : n === pairs.length ? "all" : "some");
      if (pairs.length === 0) return { ticked: "none", linked: "none" };
      const keys = pairs.map((p) => ({ key: actKey(p.lead.contributionId, actId), media: p.item.id }));
      // Ticked: per lead (several photos of one session share a tick); linked: per photo and lead
      const tickKeys = [...new Set(keys.map((k) => k.key))];
      const tickedN = tickKeys.filter((k) => ticks.has(k)).length;
      return {
        ticked: tickedN === 0 ? "none" : tickedN === tickKeys.length ? "all" : "some",
        linked: of(keys.filter((k) => evidence[k.media]?.includes(k.key)).length),
      };
    },
    [leadsOf, ticks, evidence],
  );

  /** The acts a photo is evidence for, with whose they are */
  const linkedOn = useCallback(
    (item: GalleryItem) => {
      const leads = new Map(peopleOn(item).leads.map((l) => [l.contributionId, l]));
      return (evidence[item.id] ?? []).flatMap((key) => {
        const [contributionId, actId] = key.split(":") as [string, string];
        const lead = leads.get(contributionId);
        const act = actById.get(actId);
        return lead && act ? [{ key, lead, act }] : [];
      });
    },
    [evidence, peopleOn, actById],
  );

  const restore = useCallback(() => {
    setTicks(ticksOf(data));
    setEvidence(data?.evidence ?? {});
  }, [data]);

  /** Ticks the act for the chosen people where missing and links the photos */
  const apply = useCallback(
    (items: GalleryItem[], personIds: string[], actId: string) => {
      const pairs = leadsOf(items, personIds);
      const act = actById.get(actId);
      if (pairs.length === 0 || !act) return;
      setTicks((prev) => new Set([...prev, ...pairs.map((p) => actKey(p.lead.contributionId, actId))]));
      setEvidence((prev) => {
        const next = { ...prev };
        for (const p of pairs) {
          const key = actKey(p.lead.contributionId, actId);
          if (!(next[p.item.id] ?? []).includes(key)) next[p.item.id] = [...(next[p.item.id] ?? []), key];
        }
        return next;
      });
      const who = [...new Set(pairs.map((p) => p.lead.label))];
      startTransition(async () => {
        const result = await applyActToPhotosAction(personIds, actId, [...new Set(items.map((i) => i.id))]);
        if (!result.success || !result.undo) {
          toast.error(result.error ?? "Could not save");
          restore();
          return;
        }
        const undo = result.undo;
        const photos = items.length === 1 ? "this photo" : `${items.length} photos`;
        toast(`${act.name} — ${who.join(", ")}: ${photos} as evidence`, {
          description: undo.createdActIds.length ? `Newly ticked${who.length > 1 ? ` (${undo.createdActIds.length})` : ""}` : undefined,
          action: {
            label: "Undo",
            onClick: () =>
              startTransition(async () => {
                const r = await undoApplyActToPhotosAction(undo);
                if (!r.success) toast.error(r.error ?? "Could not undo");
              }),
          },
        });
      });
    },
    [leadsOf, actById, restore],
  );

  /** Takes the photos back as evidence for the act — the tick stays */
  const unlink = useCallback(
    (items: GalleryItem[], personIds: string[], actId: string) => {
      const pairs = leadsOf(items, personIds);
      if (pairs.length === 0) return;
      setEvidence((prev) => {
        const next = { ...prev };
        for (const p of pairs) {
          const key = actKey(p.lead.contributionId, actId);
          next[p.item.id] = (next[p.item.id] ?? []).filter((k) => k !== key);
        }
        return next;
      });
      startTransition(async () => {
        const result = await unlinkActFromPhotosAction(personIds, actId, [...new Set(items.map((i) => i.id))]);
        if (!result.success) {
          toast.error(result.error ?? "Could not save");
          restore();
        }
      });
    },
    [leadsOf, restore],
  );

  if (!data) return null;
  return {
    catalog: data.catalog,
    actById,
    castById,
    peopleOn,
    suggestedScenarioId,
    chosenOn,
    setPicked,
    stateAt,
    linkedOn,
    apply,
    unlink,
  };
}

export type PhotoIntensity = NonNullable<ReturnType<typeof usePhotoIntensity>>;

function ticksOf(data: PhotoIntensityData | undefined): Set<string> {
  const out = new Set<string>();
  for (const leads of Object.values(data?.sessions ?? {})) {
    for (const l of leads) for (const a of l.acts) out.add(actKey(l.contributionId, a.actId));
  }
  return out;
}
