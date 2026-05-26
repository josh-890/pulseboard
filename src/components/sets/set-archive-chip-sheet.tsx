"use client";

import { useState, type ComponentProps } from "react";
import { FolderCheck } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SetArchivePanel } from "@/components/sets/set-archive-panel";

type PanelProps = ComponentProps<typeof SetArchivePanel>;

type SetArchiveChipSheetProps = PanelProps & {
  fileCount: number | null;
};

/**
 * Clickable chip rendered in SetHero's metadata row when the archive link is
 * healthy (status=OK). The chip itself was previously a decorative span — now
 * it's a button that opens a Sheet containing the full SetArchivePanel, so the
 * user can still inspect / re-link / unlink a healthy manual link (which is
 * otherwise invisible from the Set page when nothing needs attention).
 */
export function SetArchiveChipSheet({ fileCount, ...panelProps }: SetArchiveChipSheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[11px] text-green-600 transition hover:bg-green-500/20 hover:border-green-500/40 dark:text-green-400 cursor-pointer"
        title="Manage archive link"
        aria-label="Manage archive link"
      >
        <FolderCheck size={11} />
        In archive{fileCount != null ? ` · ${fileCount} files` : ""}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader className="border-b pb-4 px-4">
            <SheetTitle className="text-lg font-semibold">Archive link</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Inspect, re-link, or unlink the folder for this set.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4">
            <SetArchivePanel {...panelProps} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
