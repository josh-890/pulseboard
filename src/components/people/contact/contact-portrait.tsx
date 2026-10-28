"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clearContactPortraitAction, setContactPortraitAction } from "@/lib/actions/contact-actions";

type ContactPortraitProps = {
  contactId: string;
  name: string;
  avatarUrl: string | null;
  hasChosenPortrait: boolean;
  hasCataloguePortrait: boolean;
};

/**
 * The face, in the dashed frame that marks a Contact (not yet a Person).
 * Change portrait: the chosen one sticks — no catalogue run replaces it.
 */
export function ContactPortrait({ contactId, name, avatarUrl, hasChosenPortrait, hasCataloguePortrait }: ContactPortraitProps) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [isPending, start] = useTransition();

  function upload(file: File) {
    const form = new FormData();
    form.set("file", file);
    start(async () => {
      const res = await setContactPortraitAction(contactId, form);
      if (!res.success) {
        toast.error(res.error ?? "Could not set the portrait");
        return;
      }
      toast.success("Portrait changed");
      router.refresh();
    });
  }

  function reset() {
    start(async () => {
      const res = await clearContactPortraitAction(contactId);
      if (!res.success) {
        toast.error(res.error ?? "Could not reset the portrait");
        return;
      }
      toast.success("Back to the catalogue portrait");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={cn(
          "relative h-28 w-28 overflow-hidden rounded-2xl border-2 border-dashed border-white/30 bg-card/40",
          isPending && "opacity-60",
        )}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- MinIO URL, not a static asset
          <img src={avatarUrl} alt={`Portrait of ${name}`} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-muted-foreground">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        {isPending && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin" aria-label="Saving" />
          </span>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Choose a portrait image"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={isPending} onClick={() => input.current?.click()}>
        <ImagePlus size={13} /> Change portrait
      </Button>
      {hasChosenPortrait && hasCataloguePortrait && (
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs text-muted-foreground" disabled={isPending} onClick={reset}>
          <RotateCcw size={12} /> Catalogue portrait
        </Button>
      )}
    </div>
  );
}
