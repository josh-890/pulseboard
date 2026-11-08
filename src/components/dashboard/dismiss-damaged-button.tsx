"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { clearMediaDecodeIssuesAction } from "@/lib/actions/media-actions";

// Dismisses the damaged-image flag of a set's (or a session's) images on the
// dashboard — "Looks fine" for all of them, for images already dealt with.

export type DismissDamagedButtonProps = { mediaItemIds: string[]; title: string };

export function DismissDamagedButton({ mediaItemIds, title }: DismissDamagedButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function dismiss() {
    startTransition(async () => {
      const res = await clearMediaDecodeIssuesAction(mediaItemIds);
      if (res.success) {
        toast.success(`Dismissed for ${title}`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not dismiss");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={dismiss}
      disabled={isPending}
      aria-label={`Dismiss the damaged images of ${title}`}
      title="Dismiss — the red frame goes away, the images stay as they are"
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors duration-150 hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {isPending ? <Loader2 size={11} className="animate-spin" aria-hidden="true" /> : <X size={11} aria-hidden="true" />}
      Dismiss
    </button>
  );
}
