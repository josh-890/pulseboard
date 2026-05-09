"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { icgIdChangeSchema, type IcgIdChangeInput } from "@/lib/validations/person";
import { updatePersonIcgIdAction, getIcgIdImpactAction } from "@/lib/actions/person-actions";

type ImpactCounts = {
  stagingSetsSubject: number;
  stagingSetsParticipant: number;
  importBatches: number;
};

type ChangeIcgIdDialogProps = {
  personId: string;
  currentIcgId: string;
  onSuccess?: () => void;
};

export function ChangeIcgIdDialog({ personId, currentIcgId, onSuccess }: ChangeIcgIdDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<ImpactCounts | null>(null);
  const [loadingImpact, startLoadImpact] = useTransition();

  const form = useForm<IcgIdChangeInput>({
    resolver: zodResolver(icgIdChangeSchema),
    defaultValues: { id: personId, icgId: "" },
  });

  const { isSubmitting } = form.formState;

  useEffect(() => {
    if (!open) {
      form.reset({ id: personId, icgId: "" });
      setImpact(null);
      return;
    }
    startLoadImpact(async () => {
      const counts = await getIcgIdImpactAction(currentIcgId);
      setImpact(counts);
    });
  }, [open, currentIcgId, personId, form]);

  async function onSubmit(values: IcgIdChangeInput) {
    const result = await updatePersonIcgIdAction(values);

    if (result.success) {
      toast.success("ICG-ID updated");
      setOpen(false);
      onSuccess?.();
      router.refresh();
      return;
    }

    if (typeof result.error === "object" && "fieldErrors" in result.error) {
      const fieldErrors = result.error.fieldErrors as Record<string, string[]>;
      for (const [field, messages] of Object.entries(fieldErrors)) {
        form.setError(field as keyof IcgIdChangeInput, { message: messages[0] });
      }
      return;
    }

    toast.error(typeof result.error === "string" ? result.error : "Failed to update ICG-ID");
  }

  const totalAffected =
    (impact?.stagingSetsSubject ?? 0) +
    (impact?.stagingSetsParticipant ?? 0) +
    (impact?.importBatches ?? 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Change ICG-ID"
      >
        <Pencil className="h-3 w-3" />
        Change
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Change ICG-ID
            </DialogTitle>
            <DialogDescription>
              This is a system-critical field. Changing it will update all linked staging sets and
              import batches.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Current ID</span>
              <span className="ml-3 font-mono font-semibold">{currentIcgId}</span>
            </div>

            {/* Impact summary */}
            {loadingImpact ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading impact…
              </div>
            ) : impact && totalAffected > 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                <p className="mb-1 font-medium">This change will update:</p>
                <ul className="space-y-0.5 pl-3">
                  {impact.stagingSetsSubject > 0 && (
                    <li className="list-disc">
                      {impact.stagingSetsSubject} staging set{impact.stagingSetsSubject !== 1 ? "s" : ""} (subject)
                    </li>
                  )}
                  {impact.stagingSetsParticipant > 0 && (
                    <li className="list-disc">
                      {impact.stagingSetsParticipant} staging set{impact.stagingSetsParticipant !== 1 ? "s" : ""} (participant)
                    </li>
                  )}
                  {impact.importBatches > 0 && (
                    <li className="list-disc">
                      {impact.importBatches} import batch{impact.importBatches !== 1 ? "es" : ""}
                    </li>
                  )}
                </ul>
              </div>
            ) : impact ? (
              <p className="text-xs text-muted-foreground">No staging sets or import batches reference this ID.</p>
            ) : null}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} id="icgid-change-form" className="space-y-3">
                <input type="hidden" {...form.register("id")} />
                <FormField
                  control={form.control}
                  name="icgId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New ICG-ID</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. JD-96ABF"
                          className="font-mono"
                          autoFocus
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="icgid-change-form"
              disabled={isSubmitting || loadingImpact}
              className="bg-amber-500 text-white hover:bg-amber-600"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Updating…
                </>
              ) : (
                "Confirm change"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
