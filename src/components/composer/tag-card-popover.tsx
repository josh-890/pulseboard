"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ImagePlus, Info, Loader2, Star, X } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { aspectOf, MAX_EXAMPLES, type Crop } from "@/lib/tag-example";
import {
  addTagExampleAction,
  getTagCardAction,
  removeTagExampleAction,
  setTitleExampleAction,
} from "@/lib/actions/tag-example-actions";
import type { TagCard } from "@/lib/services/tag-example-service";
import { useComposerCard } from "./composer-card-context";
import { ExampleCropDialog } from "./example-crop-dialog";
import { TagExampleImage } from "./tag-example-image";

export type TagCardPopoverProps = {
  tagId: string;
  tagName: string;
  children: ReactNode;
};

const ASPECT_CLASS: Record<string, string> = { "3:4": "aspect-[3/4]", "1:1": "aspect-square" };

/**
 * A tag's card (ADR-0042, S4): its definition, its examples (★ makes one the
 * tile, × removes it), what not to confuse it with, and photos already tagged
 * with it to take as examples — or the photo on screen. Opens on a long hover,
 * a long press (touch) or the ⓘ button (keyboard).
 */
export function TagCardPopover({ tagId, tagName, children }: TagCardPopoverProps) {
  const ctx = useComposerCard();
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<TagCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cropFor, setCropFor] = useState<{ mediaItemId: string; viewUrl: string; width: number; height: number; crop?: Crop } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  const tileAspect = ctx?.tileAspectOf(tagId) ?? "1:1";
  const aspectClass = ASPECT_CLASS[tileAspect] ?? "aspect-square";

  const load = useCallback(async () => {
    setLoading(true);
    const c = await getTagCardAction(tagId);
    setCard(c);
    setLoading(false);
    return c;
  }, [tagId]);

  /** Open (and fetch) the card — from a hover, a long press or the button */
  const openCard = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) void load();
    },
    [load],
  );

  const clearTimers = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };
  useEffect(() => clearTimers, []);

  /** After a change: reload the card and tell the workbench about the tile */
  const refresh = async () => {
    const c = await load();
    const title = c?.examples.find((e) => e.isTitle);
    ctx?.onTitleChanged(tagId, title ? { url: title.url, crop: title.crop } : null);
  };

  const save = async (crop: Crop) => {
    if (!cropFor) return;
    setBusy(true);
    const r = await addTagExampleAction(tagId, cropFor.mediaItemId, crop);
    setBusy(false);
    if (!r.success) return void toast.error(r.error);
    setCropFor(null);
    toast.success(`Example saved for ${tagName}`);
    await refresh();
  };

  const act = async (fn: () => Promise<{ success: true } | { success: false; error: string }>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.success) return void toast.error(r.error);
    await refresh();
  };

  const room = !card || card.examples.length < MAX_EXAMPLES;
  const photo = ctx?.photo;
  const photoIsExample = !!card?.examples.some((e) => e.mediaItemId === photo?.id);

  return (
    <Popover open={open} onOpenChange={openCard}>
      <PopoverAnchor asChild>
        <div
          className="group/tile relative"
          onMouseEnter={() => {
            clearTimers();
            hoverTimer.current = setTimeout(() => openCard(true), 700);
          }}
          onMouseLeave={clearTimers}
          onPointerDown={(e) => {
            if (e.pointerType !== "touch") return;
            pressTimer.current = setTimeout(() => {
              suppressClick.current = true;
              openCard(true);
            }, 500);
          }}
          onPointerUp={() => pressTimer.current && clearTimeout(pressTimer.current)}
          onClickCapture={(e) => {
            if (suppressClick.current) {
              suppressClick.current = false;
              e.stopPropagation();
              e.preventDefault();
            }
          }}
        >
          {children}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openCard(!open);
            }}
            aria-label={`About ${tagName}`}
            data-testid="tag-card-open"
            className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/tile:opacity-100 [@media(hover:none)]:opacity-70"
          >
            <Info size={12} />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-80 space-y-3 p-3"
        side="left"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        data-testid="tag-card"
      >
        <div>
          <p className="text-sm font-semibold">{tagName}</p>
          {card?.description && <p className="mt-0.5 text-xs text-muted-foreground">{card.description}</p>}
          {card && card.aliases.length > 0 && (
            <p className="mt-1 truncate text-[10px] text-muted-foreground" title={card.aliases.join(", ")}>
              also: {card.aliases.join(", ")}
            </p>
          )}
        </div>

        {loading && !card ? (
          <div className="flex justify-center py-4">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : card ? (
          <>
            <section>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Examples {card.examples.length > 0 && `· ${card.examples.length}/${MAX_EXAMPLES}`}
              </p>
              {card.examples.length === 0 ? (
                <p className="text-xs text-muted-foreground">None yet — the tile shows text until one is set.</p>
              ) : (
                <ul className="grid grid-cols-5 gap-1" data-testid="tag-card-examples">
                  {card.examples.map((ex) => (
                    <li key={ex.id} className="group/ex relative">
                      <TagExampleImage url={ex.url} crop={ex.crop} className={cn(aspectClass, "rounded", ex.isTitle && "ring-2 ring-primary")} />
                      <div className="absolute inset-x-0 bottom-0 flex justify-between p-0.5 opacity-0 transition-opacity group-hover/ex:opacity-100 focus-within:opacity-100">
                        <button
                          type="button"
                          disabled={busy || ex.isTitle}
                          onClick={() => act(() => setTitleExampleAction(ex.id))}
                          aria-label={ex.isTitle ? "The tile's example" : "Use as the tile"}
                          className="rounded bg-black/60 p-0.5 text-white disabled:opacity-60"
                        >
                          <Star size={10} className={ex.isTitle ? "fill-current" : ""} />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => act(() => removeTagExampleAction(ex.id))}
                          aria-label="Remove example"
                          className="rounded bg-black/60 p-0.5 text-white"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {photo?.viewUrl && room && !photoIsExample && (
                <button
                  type="button"
                  onClick={() => setCropFor({ mediaItemId: photo.id, viewUrl: photo.viewUrl!, width: photo.width, height: photo.height })}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  data-testid="tag-card-use-photo"
                >
                  <ImagePlus size={12} /> Use the photo on screen
                </button>
              )}
            </section>

            {room && card.proposals.length > 0 && (
              <section>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tagged with it — take one</p>
                <ul className="grid grid-cols-6 gap-1">
                  {card.proposals.map((p) => (
                    <li key={p.mediaItemId}>
                      <button
                        type="button"
                        onClick={() => setCropFor({ mediaItemId: p.mediaItemId, viewUrl: p.viewUrl, width: p.width, height: p.height })}
                        className="block aspect-[3/4] w-full overflow-hidden rounded bg-muted ring-primary hover:ring-2 focus-visible:outline-none focus-visible:ring-2"
                        aria-label="Take as example"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- MinIO URL */}
                        <img src={p.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {card.confusables.length > 0 && (
              <section>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Do not confuse with</p>
                <ul className="space-y-1.5" data-testid="tag-card-confusables">
                  {card.confusables.map((c) => (
                    <li key={c.id} className="flex items-start gap-2">
                      {c.example ? (
                        <TagExampleImage url={c.example.url} crop={c.example.crop} className={cn(aspectClass, "w-8 shrink-0 rounded")} />
                      ) : (
                        <span className={cn(aspectClass, "w-8 shrink-0 rounded bg-muted")} aria-hidden />
                      )}
                      <span className="min-w-0 text-xs">
                        <span className="font-medium">{c.name}</span>
                        {c.description && <span className="block text-[11px] text-muted-foreground">{c.description}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : null}
      </PopoverContent>

      {cropFor && (
        <ExampleCropDialog
          open
          onOpenChange={(o) => !o && setCropFor(null)}
          tagName={tagName}
          photo={cropFor}
          tileAspect={tileAspect}
          initialCrop={cropFor.crop}
          busy={busy}
          onSave={save}
        />
      )}
    </Popover>
  );
}

/** Aspect ratio class for a path's tile shape — shared with the tile */
export function tileAspectClass(tileAspect: string): string {
  return ASPECT_CLASS[tileAspect] ?? (aspectOf(tileAspect) < 1 ? "aspect-[3/4]" : "aspect-square");
}
