"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getPersonErasForPickerAction,
  updateSessionContributionAction,
} from "@/lib/actions/contribution-actions";

type EraOption = { id: string; label: string; date: Date | null; isBaseline: boolean };

type EditContributionEraDialogProps = {
  contributionId: string;
  sessionId: string;
  personId: string;
  personDisplayName: string;
  currentEraId: string | null;
  currentEraLabel: string | null;
  // For tooltip / contextual messaging only.
  sessionDate: Date | null;
  // Render-prop trigger — lets the parent style the click target as a pill,
  // pencil, button, whatever. Receives the open() callback.
  trigger: React.ReactNode;
};

/**
 * Dialog for editing the Era a SessionContribution is pinned to. The picker
 * UX mirrors AddContributorSheet but operates on an existing row and writes
 * via updateSessionContributionAction (which propagates the new eraId across
 * every contribution row for the same (sessionId, personId) — ADR-0004
 * one-shoot-one-era invariant).
 */
export function EditContributionEraDialog({
  contributionId,
  sessionId,
  personId,
  personDisplayName,
  currentEraId,
  currentEraLabel,
  sessionDate,
  trigger,
}: EditContributionEraDialogProps) {
  const [open, setOpen] = useState(false);
  const [eras, setEras] = useState<EraOption[]>([]);
  const [erasLoading, setErasLoading] = useState(false);
  const [selectedEraId, setSelectedEraId] = useState<string>(currentEraId ?? "");
  const [isPending, startTransition] = useTransition();

  // Sentinel value for the "Clear era" option (Radix Select rejects empty
  // string as a SelectItem value). Translated to null when saving.
  const NONE_VALUE = "__none__";

  // Load the person's eras when the dialog opens (event-driven — not in a
  // useEffect, since opening is a user gesture and the React Compiler's
  // set-state-in-effect rule rightly flags effect-driven mutations).
  async function loadErasIfNeeded() {
    if (eras.length > 0) return;
    setErasLoading(true);
    try {
      const list = await getPersonErasForPickerAction(personId);
      setEras(list);
      setSelectedEraId(currentEraId ?? NONE_VALUE);
    } finally {
      setErasLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      void loadErasIfNeeded();
    }
  }

  function handleSave() {
    const nextEraId = selectedEraId === NONE_VALUE ? null : selectedEraId || null;
    if (nextEraId === (currentEraId ?? null)) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const result = await updateSessionContributionAction(contributionId, sessionId, {
        eraId: nextEraId,
      });
      if (result.success) {
        toast.success("Era updated.");
        setOpen(false);
      } else {
        toast.error(result.error ?? "Failed to update era.");
      }
    });
  }

  // Compute the would-be default era for context (shows "(recommended)" hint)
  let suggestedEraId: string | null = null;
  if (sessionDate && eras.length > 0) {
    const sd = new Date(sessionDate);
    const candidates = eras
      .filter((e) => !e.isBaseline && e.date && new Date(e.date) <= sd)
      .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());
    suggestedEraId = candidates[0]?.id ?? eras.find((e) => e.isBaseline)?.id ?? null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil size={15} />
            Edit Era
          </DialogTitle>
          <DialogDescription>
            Which era was <span className="font-medium">{personDisplayName}</span> in at
            this shoot? Changing it updates every role this person holds in the session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-2">
          <Label>Era</Label>
          {erasLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" /> loading eras…
            </div>
          ) : eras.length === 0 ? (
            <p className="text-xs text-muted-foreground">No eras for this person yet.</p>
          ) : (
            <Select value={selectedEraId || NONE_VALUE} onValueChange={setSelectedEraId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an era…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>
                  <span className="text-muted-foreground italic">No era linked</span>
                </SelectItem>
                {eras.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.label}
                    {e.isBaseline ? " · baseline" : e.date ? ` · ${new Date(e.date).getUTCFullYear()}` : ""}
                    {e.id === suggestedEraId && e.id !== currentEraId ? " — suggested" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {currentEraLabel && (
            <p className="text-[11px] text-muted-foreground/70">
              Currently linked: <span className="font-medium">{currentEraLabel}</span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
