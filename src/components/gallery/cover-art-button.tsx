"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OPEN_COVER_ART, type OpenCoverDetail } from "@/lib/cover-viewer";
import { BookImage } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { CoverArtSlot, type CoverArtSlotProps } from "@/components/gallery/cover-art-slot";

export type CoverArtButtonProps = Omit<CoverArtSlotProps, "className" | "onOverlayChange">;

/**
 * The way into the cover slot (ADR-0040): a quiet link in the hero's meta row
 * ("2 cover art" / "no cover art"). Opens the slot in a side sheet; the sheet is
 * not modal, so the slot's lightbox can take the screen, and it steps aside meanwhile.
 */
export function CoverArtButton(props: CoverArtButtonProps) {
  const [open, setOpen] = useState(false);
  const [overlay, setOverlay] = useState<"lightbox" | "confirm" | null>(null);
  const [showItemId, setShowItemId] = useState<string | null>(null);
  const count = props.items.length;
  // Opened for the hero's cover: only the viewer is wanted — closing it closes the sheet too
  const fromHero = useRef<"asked" | "showing" | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<OpenCoverDetail>).detail.mediaItemId;
      if (!props.items.some((it) => it.id === id)) return;
      e.preventDefault();
      if (!open) fromHero.current = "asked";
      setShowItemId(id);
      setOpen(true);
    };
    window.addEventListener(OPEN_COVER_ART, onOpen);
    return () => window.removeEventListener(OPEN_COVER_ART, onOpen);
  }, [props.items, open]);

  const onOverlayChange = useCallback((o: "lightbox" | "confirm" | null) => {
    setOverlay(o);
    if (o === "lightbox" && fromHero.current === "asked") fromHero.current = "showing";
    else if (o === null && fromHero.current === "showing") {
      fromHero.current = null;
      setOpen(false);
    }
  }, []);
  const onShown = useCallback(() => setShowItemId(null), []);

  return (
    <Sheet
      open={open}
      modal={false}
      // While the lightbox or a confirmation is up, an Esc or a click there is theirs
      onOpenChange={(next) => {
        if (!next && overlay) return;
        if (!next) fromHero.current = null;
        setOpen(next);
      }}
    >
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-sm underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={count > 0 ? `${count} cover art — manage` : "No cover art — upload or manage"}
          title="The publisher's cover, kept apart from the photos"
          data-testid="cover-art-button"
        >
          <BookImage size={12} aria-hidden="true" />
          {count > 0 ? `${count} cover art` : "no cover art"}
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className={cn("w-full overflow-y-auto sm:max-w-xl", overlay === "lightbox" && "invisible")}
        onInteractOutside={(e) => {
          if (overlay) e.preventDefault();
        }}
      >
        <SheetHeader className="pb-0">
          <SheetTitle>Cover art</SheetTitle>
          <SheetDescription>
            The publisher&apos;s cover, kept apart from the photos. The cover itself may be cover art or a photo.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          <CoverArtSlot {...props} onOverlayChange={onOverlayChange} showItemId={showItemId} onShown={onShown} className="border-0 bg-transparent p-0 shadow-none backdrop-blur-none sm:p-0" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
