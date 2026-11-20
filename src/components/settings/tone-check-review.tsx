"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ToneSwatch } from "@/components/shared/tone-swatch";
import { applyToneCheckAction } from "@/lib/actions/media-actions";
import type { ToneCheckItem } from "@/lib/services/tone-service";
import type { ToneValue } from "@/lib/tone";
import { cn } from "@/lib/utils";

export type ToneCheckReviewProps = { items: ToneCheckItem[]; total: number };

/**
 * The tone check (ADR-0041): each borderline photo with what was measured; a tap
 * flips it. Save stores every photo shown as decided by hand — each on its own.
 */
export function ToneCheckReview({ items, total }: ToneCheckReviewProps) {
  const router = useRouter();
  const [choice, setChoice] = useState<Record<string, ToneValue>>(() =>
    Object.fromEntries(items.map((it) => [it.id, it.tone])),
  );
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 text-sm text-muted-foreground shadow-md backdrop-blur-sm">
        Nothing close to the line — every photo is clearly color or black &amp; white, or decided by hand.
      </div>
    );
  }

  const changed = items.filter((it) => choice[it.id] !== it.tone).length;
  const mono = items.filter((it) => choice[it.id] === "MONO").length;

  function save() {
    const decisions = items.map((it) => ({ id: it.id, tone: choice[it.id] ?? it.tone }));
    startTransition(async () => {
      const r = await applyToneCheckAction(decisions);
      if (r.success) {
        toast.success(`${r.saved} photo${r.saved === 1 ? "" : "s"} decided`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/20 bg-card/90 p-3 shadow-md backdrop-blur-md">
        <span className="text-sm" aria-live="polite">
          {items.length < total ? `${items.length} of ${total}` : items.length} shown ·{" "}
          <span className="inline-flex items-center gap-1">
            <ToneSwatch tone="color" size="xs" /> {items.length - mono}
          </span>{" "}
          ·{" "}
          <span className="inline-flex items-center gap-1">
            <ToneSwatch tone="mono" size="xs" /> {mono}
          </span>
          {changed > 0 && <span className="ml-2 text-primary">{changed} changed</span>}
        </span>
        <Button size="sm" className="ml-auto gap-1.5" disabled={pending} onClick={save} data-testid="tone-check-save">
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Save {items.length}
        </Button>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {items.map((it) => {
          const tone = choice[it.id] ?? it.tone;
          const flipped = tone !== it.tone;
          return (
            <li
              key={it.id}
              data-testid="tone-check-item"
              data-media-id={it.id}
              data-tone={tone}
              className={cn(
                "overflow-hidden rounded-xl border bg-card/70 shadow-sm backdrop-blur-sm transition-colors",
                flipped ? "border-primary/60" : "border-white/20",
              )}
            >
              <button
                type="button"
                onClick={() => setChoice((c) => ({ ...c, [it.id]: tone === "MONO" ? "COLOR" : "MONO" }))}
                aria-label={`${it.filename}: ${tone === "MONO" ? "black & white" : "color"} — switch`}
                className="relative block w-full bg-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {it.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.thumbUrl} alt="" loading="lazy" className="aspect-[3/4] w-full object-contain" />
                ) : (
                  <span className="flex aspect-[3/4] items-center justify-center text-[11px] text-muted-foreground">
                    no preview
                  </span>
                )}
                <span
                  className={cn(
                    "absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow",
                    flipped ? "bg-primary text-primary-foreground" : "bg-black/60 text-white",
                  )}
                >
                  <ToneSwatch tone={tone === "MONO" ? "mono" : "color"} size="xs" />
                  {tone === "MONO" ? "B&W" : "Color"}
                </span>
              </button>
              <div className="space-y-0.5 p-2 text-[11px]">
                <span className="block truncate" title={it.filename}>
                  {it.filename}
                </span>
                <span className="flex items-center justify-between gap-2 text-muted-foreground">
                  {it.setId ? (
                    <Link href={`/sets/${it.setId}`} className="min-w-0 truncate hover:text-foreground hover:underline">
                      {it.setTitle}
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span className="shrink-0 tabular-nums" title="Color left once the tint is taken away (below 5 = B&W)">
                    {it.chroma.toFixed(1)}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
