"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hourglass, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { STUB_REASON_LABEL, STUB_REASONS } from "@/lib/archive-stub";
import type { ArchiveStub } from "@/lib/archive-stub";
import { endArchiveStubAction, markArchiveStubAction } from "@/lib/actions/archive-stub-actions";
import type { StubReason } from "@/generated/prisma/enums";
import { StubBadge } from "./stub-badge";

type ArchiveStubControlProps = {
  folderId: string;
  stub: ArchiveStub | null;
  /** Called with the new state after a change; the default refreshes the route. */
  onChanged?: (stub: ArchiveStub | null) => void;
};

/**
 * Mark an archive folder as a stub, edit why, or end it (ADR-0032). Ending means
 * "the media in this folder are the real set now": the folder cover is rebuilt,
 * and the scan removes `.pulseboard\STUB` on its next run.
 */
export function ArchiveStubControl({ folderId, stub, onChanged }: ArchiveStubControlProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<StubReason>(stub?.reason ?? "FEW_MEDIA");
  const [note, setNote] = useState(stub?.note ?? "");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [isPending, startTransition] = useTransition();

  function done(next: ArchiveStub | null) {
    setOpen(false);
    setConfirmEnd(false);
    if (onChanged) onChanged(next);
    else router.refresh();
  }

  function save() {
    startTransition(async () => {
      const res = await markArchiveStubAction(folderId, { reason, note });
      if (res.success) done({ since: stub?.since ?? new Date(), reason, note: note.trim() || null });
      else toast.error(res.error);
    });
  }

  function end() {
    startTransition(async () => {
      const res = await endArchiveStubAction(folderId);
      if (res.success) {
        toast.success("Stub ended — the folder cover will be rebuilt on the next cover run");
        done(null);
      } else toast.error(res.error);
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setReason(stub?.reason ?? "FEW_MEDIA");
          setNote(stub?.note ?? "");
          setConfirmEnd(false);
        }
      }}
    >
      <PopoverTrigger asChild>
        {stub ? (
          <button
            type="button"
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Edit or end stub"
          >
            <StubBadge stub={stub} className="cursor-pointer hover:bg-violet-500/25" />
          </button>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground">
            <Hourglass size={12} />
            Mark as stub
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <div>
          <p className="text-sm font-medium">{stub ? "Stub archive copy" : "Mark as stub"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A placeholder you will upgrade in place. Also set by a{" "}
            <code className="rounded bg-muted px-1">.pulseboard\STUB</code> file.
          </p>
        </div>

        <fieldset className="space-y-1">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">Why</legend>
          {STUB_REASONS.map((r) => (
            <label
              key={r}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm transition-colors duration-150",
                reason === r ? "bg-violet-500/10" : "hover:bg-muted/50",
              )}
            >
              <input
                type="radio"
                name={`stub-reason-${folderId}`}
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="accent-violet-600"
              />
              {STUB_REASON_LABEL[r]}
            </label>
          ))}
        </fieldset>

        <div>
          <label htmlFor={`stub-note-${folderId}`} className="mb-1 block text-xs font-medium text-muted-foreground">
            Note <span className="font-normal">(optional)</span>
          </label>
          <Textarea
            id={`stub-note-${folderId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. 12 of 80 images, 800 px"
            rows={2}
            className="text-sm"
          />
        </div>

        {stub && (
          <p className="text-[11px] text-muted-foreground">
            Stub since {new Date(stub.since).toLocaleDateString()}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          {stub ? (
            confirmEnd ? (
              <Button size="sm" variant="default" onClick={end} disabled={isPending} className="gap-1.5">
                {isPending && <Loader2 size={12} className="animate-spin" />}
                Yes, it&apos;s the real set
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirmEnd(true)} disabled={isPending}>
                End stub…
              </Button>
            )
          ) : (
            <span />
          )}
          <Button size="sm" onClick={save} disabled={isPending} className="gap-1.5">
            {isPending && !confirmEnd && <Loader2 size={12} className="animate-spin" />}
            {stub ? "Save" : "Mark as stub"}
          </Button>
        </div>
        {confirmEnd && (
          <p className="text-[11px] text-muted-foreground">
            The media in this folder are the real set now. The folder cover is rebuilt and the
            next scan removes <code className="rounded bg-muted px-1">STUB</code>.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
