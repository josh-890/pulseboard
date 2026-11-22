"use client";

import { useEffect, useState } from "react";
import { Check, FolderInput, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getComposerBodyFeaturesAction } from "@/lib/actions/composer-actions";
import { assignMediaToDetailCategoryAction } from "@/lib/actions/media-actions";
import type { ComposerBodyFeature } from "@/lib/services/composer-bridge-service";

export type ComposerDetailBridgeProps = {
  photoId: string;
  /** The person described — the solo person, or the lane chosen */
  person: { id: string; name: string; icgId: string };
  /** Region tags held for her on this photo */
  regionTagIds: string[];
};

/**
 * The bridge to the person archive (ADR-0043): a detail photo tagged with a
 * region offers the person's body marks and modifications there ("Anna's
 * tattoo 'Rose'?"). A click hangs the photo into the person's archive under that mark,
 * through the same route as the lightbox's detail sheet (a copy in the
 * reference session). The tags stay what they are.
 */
export function ComposerDetailBridge({ photoId, person, regionTagIds }: ComposerDetailBridgeProps) {
  const key = `${person.id}|${regionTagIds.join(",")}`;
  const [loaded, setLoaded] = useState<{ key: string; features: ComposerBodyFeature[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let live = true;
    void getComposerBodyFeaturesAction(person.id, regionTagIds).then((r) => {
      if (live) setLoaded({ key, features: r.success ? r.features : [] });
    });
    return () => {
      live = false;
    };
    // `key` stands for person + regions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const features = loaded?.key === key ? loaded.features : null;
  if (features !== null && features.length === 0) return null;

  const assign = async (f: ComposerBodyFeature, force = false) => {
    setBusy(f.id);
    const r = await assignMediaToDetailCategoryAction(photoId, person.id, f.categoryId, {
      force,
      entity: { field: f.kind === "mark" ? "bodyMarkId" : "bodyModificationId", id: f.id },
    });
    setBusy(null);
    if (r.success) {
      setDone((d) => new Set([...d, `${photoId}|${f.id}`]));
      toast.success(`In ${person.name} (${person.icgId}) › ${f.categoryName}${r.copied ? " — copied to the reference session" : ""}`);
    } else if (r.code === "ALREADY_IN_CATEGORY") {
      setDone((d) => new Set([...d, `${photoId}|${f.id}`]));
      toast.info(`Already in ${person.name}'s ${f.categoryName}`);
    } else toast.error(r.error);
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-t border-border/60 px-3 py-1.5 text-[11px]" data-testid="composer-detail-bridge">
      <FolderInput size={12} aria-hidden className="shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">
        {person.name} ({person.icgId}) here:
      </span>
      {features === null ? (
        <Loader2 size={12} className="animate-spin text-muted-foreground" aria-label="Loading body features" />
      ) : (
        features.map((f) => {
          const isDone = done.has(`${photoId}|${f.id}`);
          return (
            <button
              key={f.id}
              type="button"
              disabled={busy !== null}
              onClick={() => void assign(f)}
              data-testid="composer-bridge-feature"
              title={`Add this photo to ${person.name}'s ${f.categoryName} — ${f.label}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                isDone ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border/60 hover:bg-muted/60",
              )}
            >
              {busy === f.id ? <Loader2 size={11} className="animate-spin" aria-hidden /> : isDone ? <Check size={11} aria-hidden /> : null}
              {f.label}
              <span className="font-normal text-muted-foreground">→ {f.categoryName}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
