"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { dismissArchiveUploadFailedAction } from "@/lib/actions/archive-actions";

// Clears a set's "did not upload" list on the dashboard (2026-10-17) — for files
// you have decided not to upload, or a list left over from a failed run.

export type DismissFailedUploadButtonProps = { setId: string; title: string };

export function DismissFailedUploadButton({ setId, title }: DismissFailedUploadButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function dismiss() {
    startTransition(async () => {
      const res = await dismissArchiveUploadFailedAction(setId);
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
      aria-label={`Dismiss the failed uploads of ${title}`}
      title="Dismiss — the list goes away; files not uploaded stay missing"
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors duration-150 hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {isPending ? <Loader2 size={11} className="animate-spin" aria-hidden="true" /> : <X size={11} aria-hidden="true" />}
      Dismiss
    </button>
  );
}
