"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import NextImage from "next/image";
import { toast } from "sonner";
import { Star, Crop, Link2, IdCard } from "lucide-react";
import { cn, focalStyle } from "@/lib/utils";
import type { GalleryItem } from "@/lib/types";
import { CrossSessionPicker } from "@/components/media/cross-session-picker";
import { MotifAligner } from "@/components/people/motif-aligner";
import type { MotifTemplateRecord } from "@/lib/services/motif-template-service";
import type { ProfileFraming } from "@/lib/services/profile-service";
import { getAlignmentTemplateForCategoryAction } from "@/lib/actions/motif-template-actions";
import { copyMediaItemToReferenceAction, linkMediaToDetailCategoryAction, setRepresentativeAction } from "@/lib/actions/media-actions";

type Pick = { kind: "standardize" | "link"; categoryId: string; name: string };

export function ProfileManager({
  personId,
  referenceSessionId,
  framings,
}: {
  personId: string;
  referenceSessionId: string;
  framings: ProfileFraming[];
}) {
  const router = useRouter();
  const [pick, setPick] = useState<Pick | null>(null);
  const [aligner, setAligner] = useState<{ template: MotifTemplateRecord; source: { id: string; url: string }; categoryId: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res.success) router.refresh();
      else toast.error(res.error ?? "Action failed");
    } finally {
      setBusy(false);
    }
  }, [router]);

  const onPicked = useCallback(async (item: GalleryItem) => {
    if (!pick) return;
    const m = pick;
    setPick(null);
    if (m.kind === "standardize") {
      const template = await getAlignmentTemplateForCategoryAction(m.categoryId);
      if (!template) { toast.error(`No template bound to ${m.name}`); return; }
      setAligner({ template, source: { id: item.id, url: item.urls.original }, categoryId: m.categoryId });
      return;
    }
    // Link a raw photo: copy into the reference session, link to the category, make it the representative.
    setBusy(true);
    try {
      const copy = await copyMediaItemToReferenceAction(item.id, personId, referenceSessionId);
      if (copy.success && copy.newMediaItemId) {
        await linkMediaToDetailCategoryAction(personId, [copy.newMediaItemId], m.categoryId);
        await setRepresentativeAction(personId, copy.newMediaItemId, m.categoryId);
        router.refresh();
      } else {
        toast.error(("error" in copy && copy.error) || "Failed to link photo");
      }
    } finally {
      setBusy(false);
    }
  }, [pick, personId, referenceSessionId, router]);

  return (
    <div className="rounded-2xl border border-white/15 bg-card/60 p-4 shadow-md backdrop-blur-sm">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">Profile framings</h2>
        <p className="text-[11px] text-muted-foreground">
          The <strong>Headshot</strong> representative is the person&rsquo;s ID-card picture and avatar. Standardize aligns to the framing&rsquo;s template; ★ picks the one shown.
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        {framings.map((fr) => {
          const rep = fr.images.find((i) => i.mediaItemId === fr.repMediaItemId) ?? null;
          const stateLabel = !rep ? "Empty" : rep.isAligned ? "Standardized" : "Raw";
          const stateClass = !rep
            ? "bg-muted/40 text-muted-foreground"
            : rep.isAligned
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-amber-500/15 text-amber-600 dark:text-amber-400";
          return (
            <div key={fr.categoryId} className="flex w-44 shrink-0 flex-col gap-1.5">
              <div
                className={cn("relative w-full overflow-hidden rounded-lg border", rep ? "border-white/10 bg-muted/30" : "border-dashed border-white/10 bg-muted/15")}
                style={{ aspectRatio: `${fr.aspectW} / ${fr.aspectH}` }}
              >
                {rep?.thumbUrl ? (
                  <NextImage src={rep.thumbUrl} alt={fr.name} fill unoptimized className="object-cover" style={rep.isAligned ? undefined : focalStyle(rep.focalX, rep.focalY)} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground/50">empty</div>
                )}
                {fr.isAvatarSource && (
                  <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded bg-amber-400/90 px-1 py-0.5 text-[9px] font-medium text-black">
                    <IdCard size={9} /> Avatar
                  </span>
                )}
              </div>

              <span className="truncate text-xs font-medium" title={fr.name}>{fr.name}</span>
              <span className={cn("w-fit rounded px-1.5 py-0.5 text-[10px] font-medium", stateClass)}>{stateLabel}</span>

              {/* Image strip — pick the representative (★) */}
              {fr.images.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  {fr.images.map((img) => (
                    <button
                      key={img.mediaItemId}
                      type="button"
                      disabled={busy}
                      onClick={() => void run(() => setRepresentativeAction(personId, img.mediaItemId, fr.categoryId))}
                      title={img.isRepresentative ? "Representative" : "Set as representative"}
                      className={cn("relative h-9 w-9 overflow-hidden rounded border", img.mediaItemId === fr.repMediaItemId ? "border-amber-400 ring-1 ring-amber-400/50" : "border-white/10 hover:border-white/30")}
                    >
                      {img.thumbUrl && <NextImage src={img.thumbUrl} alt="" fill unoptimized className="object-cover" />}
                      {img.isRepresentative && <Star size={9} className="absolute right-0 top-0 fill-amber-400 text-amber-400" />}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-0.5 flex flex-wrap gap-1">
                {fr.hasTemplate && (
                  <button type="button" disabled={busy} onClick={() => setPick({ kind: "standardize", categoryId: fr.categoryId, name: fr.name })}
                    className="flex items-center gap-1 rounded-md border border-white/15 bg-card/60 px-2 py-1 text-[11px] text-muted-foreground transition-all hover:border-entity-person/40 hover:text-entity-person">
                    <Crop size={11} /> Standardize
                  </button>
                )}
                <button type="button" disabled={busy} onClick={() => setPick({ kind: "link", categoryId: fr.categoryId, name: fr.name })}
                  className="flex items-center gap-1 rounded-md border border-white/15 bg-card/60 px-2 py-1 text-[11px] text-muted-foreground transition-all hover:border-white/30 hover:text-foreground">
                  <Link2 size={11} /> Link
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {pick && (
        <CrossSessionPicker
          personId={personId}
          title={pick.kind === "standardize" ? `Pick a source photo to standardize for ${pick.name}` : `Pick a photo to link to ${pick.name}`}
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
          onSaved={(mediaItemId) => {
            const cid = aligner.categoryId;
            setAligner(null);
            if (mediaItemId) void run(() => setRepresentativeAction(personId, mediaItemId, cid));
            else router.refresh();
          }}
          onCancel={() => setAligner(null)}
        />
      )}
    </div>
  );
}
