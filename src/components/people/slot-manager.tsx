"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import NextImage from "next/image";
import { Star, Crop, Link2, Trash2 } from "lucide-react";
import { cn, focalStyle } from "@/lib/utils";
import type { GalleryItem } from "@/lib/types";
import { CrossSessionPicker } from "@/components/media/cross-session-picker";
import { MotifAligner } from "@/components/people/motif-aligner";
import { assignHeadshotSlot, clearSlotAction, setPersonAvatarAction } from "@/lib/actions/media-actions";
import type { MotifTemplateRecord } from "@/lib/services/motif-template-service";
import type { SlotState } from "@/lib/services/media-service";

type SlotManagerProps = {
  personId: string;
  referenceSessionId: string;
  templates: MotifTemplateRecord[];
  slotState: SlotState[];
  slotLabels: { slot: number; label: string }[];
};

type Mode =
  | { kind: "standardize"; slot: number; label: string; template: MotifTemplateRecord }
  | { kind: "link"; slot: number; label: string };

export function SlotManager({ personId, referenceSessionId, templates, slotState, slotLabels }: SlotManagerProps) {
  const router = useRouter();
  const [pick, setPick] = useState<Mode | null>(null);
  const [aligner, setAligner] = useState<{ template: MotifTemplateRecord; source: { id: string; url: string } } | null>(null);
  const [busy, setBusy] = useState(false);

  const stateBySlot = new Map(slotState.map((s) => [s.slot, s]));
  const templateBySlot = new Map(templates.map((t) => [t.slot, t]));

  const run = useCallback(async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res.success) router.refresh();
    } finally {
      setBusy(false);
    }
  }, [router]);

  const onPicked = useCallback((item: GalleryItem) => {
    if (!pick) return;
    if (pick.kind === "standardize") {
      setAligner({ template: pick.template, source: { id: item.id, url: item.urls.original } });
      setPick(null);
    } else {
      const slot = pick.slot;
      setPick(null);
      void run(() => assignHeadshotSlot(personId, item.id, slot));
    }
  }, [pick, personId, run]);

  return (
    <div className="rounded-2xl border border-white/15 bg-card/60 p-4 shadow-md backdrop-blur-sm">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">Profile Slots</h2>
        <p className="text-[11px] text-muted-foreground">
          Standardize (align to the template) or link a raw photo. The ★ slot is the default shown on cards.
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        {slotLabels.map((sl) => {
          const template = templateBySlot.get(sl.slot);
          const st = stateBySlot.get(sl.slot);
          const aspectW = template?.aspectW ?? 2;
          const aspectH = template?.aspectH ?? 3;
          const stateLabel = !st ? "Empty" : st.isStandardized ? "Standardized" : "Raw — not aligned";
          const stateClass = !st
            ? "bg-muted/40 text-muted-foreground"
            : st.isStandardized
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-amber-500/15 text-amber-600 dark:text-amber-400";
          return (
            <div key={sl.slot} className="flex w-40 shrink-0 flex-col gap-1.5">
              <div
                className={cn(
                  "relative w-full overflow-hidden rounded-lg border",
                  st ? "border-white/10 bg-muted/30" : "border-dashed border-white/10 bg-muted/15",
                )}
                style={{ aspectRatio: `${aspectW} / ${aspectH}` }}
              >
                {st?.thumbUrl ? (
                  <NextImage src={st.thumbUrl} alt={sl.label} width={aspectW * 90} height={aspectH * 90} unoptimized className="h-full w-full object-cover" style={focalStyle(st.focalX, st.focalY)} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground/50">empty</div>
                )}
                {st && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => setPersonAvatarAction(personId, st.mediaItemId))}
                    title={st.isAvatar ? "Default slot" : "Set as default"}
                    aria-label={st.isAvatar ? "Default slot" : "Set as default"}
                    className={cn(
                      "absolute left-1 top-1 rounded-full p-1 transition-colors",
                      st.isAvatar ? "bg-amber-400 text-black" : "bg-black/55 text-white/80 hover:text-amber-300",
                    )}
                  >
                    <Star size={12} className={st.isAvatar ? "fill-current" : ""} />
                  </button>
                )}
              </div>

              <span className="truncate text-xs font-medium" title={sl.label}>{sl.label}</span>
              <span className={cn("w-fit rounded px-1.5 py-0.5 text-[10px] font-medium", stateClass)}>{stateLabel}</span>

              <div className="mt-0.5 flex flex-wrap gap-1">
                {template && (
                  <button type="button" disabled={busy} onClick={() => setPick({ kind: "standardize", slot: sl.slot, label: sl.label, template })}
                    className="flex items-center gap-1 rounded-md border border-white/15 bg-card/60 px-2 py-1 text-[11px] text-muted-foreground transition-all hover:border-entity-person/40 hover:text-entity-person">
                    <Crop size={11} /> Standardize
                  </button>
                )}
                <button type="button" disabled={busy} onClick={() => setPick({ kind: "link", slot: sl.slot, label: sl.label })}
                  className="flex items-center gap-1 rounded-md border border-white/15 bg-card/60 px-2 py-1 text-[11px] text-muted-foreground transition-all hover:border-white/30 hover:text-foreground">
                  <Link2 size={11} /> Link
                </button>
                {st && (
                  <button type="button" disabled={busy} onClick={() => void run(() => clearSlotAction(personId, sl.slot))}
                    className="flex items-center gap-1 rounded-md border border-white/15 bg-card/60 px-2 py-1 text-[11px] text-muted-foreground transition-all hover:border-destructive/40 hover:text-destructive">
                    <Trash2 size={11} /> Clear
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {pick && (
        <CrossSessionPicker
          personId={personId}
          title={
            pick.kind === "standardize"
              ? `Pick a source photo to standardize for ${pick.label}`
              : `Pick a photo to link to ${pick.label}`
          }
          onSelect={onPicked}
          onClose={() => setPick(null)}
        />
      )}
      {aligner && (
        <MotifAligner
          source={aligner.source}
          template={aligner.template}
          personId={personId}
          referenceSessionId={referenceSessionId}
          onSaved={() => { setAligner(null); router.refresh(); }}
          onCancel={() => setAligner(null)}
        />
      )}
    </div>
  );
}
