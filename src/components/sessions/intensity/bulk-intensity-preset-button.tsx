"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
  applyBulkIntensityPresetAction,
  getBulkPresetChoicesAction,
  planBulkIntensityPresetAction,
  undoBulkIntensityPresetAction,
} from "@/lib/actions/intensity-actions";
import type { BulkEntity, BulkPresetChoices } from "@/lib/services/intensity-bulk-service";
import { cn } from "@/lib/utils";

export type BulkIntensityPresetButtonProps = {
  entity: BulkEntity;
  /** The selected sessions or sets */
  ids: string[];
};

type Plan = { preset: { id: string; name: string; scenario: string }; models: number; sessions: number; confirmed: number; otherCast: number };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// A preset for the whole selection (2026-10-27, slice 4): pick one, see whom it
// reaches — models not confirmed yet whose cast fits its scenario — then apply.
// They land to review, as in the panel; the toast offers Undo.
export function BulkIntensityPresetButton({ entity, ids }: BulkIntensityPresetButtonProps) {
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<BulkPresetChoices | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [applying, startApplying] = useTransition();
  const what = entity === "SESSION" ? plural(ids.length, "session") : plural(ids.length, "set");

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setPlan(null);
    setError(null);
    startLoading(async () => {
      const result = await getBulkPresetChoicesAction();
      if (result.success) setChoices(result.data);
      else setError(result.error);
    });
  }

  function pick(presetId: string) {
    setError(null);
    startLoading(async () => {
      const result = await planBulkIntensityPresetAction(entity, ids, presetId);
      if (result.success) setPlan(result.data);
      else setError(result.error);
    });
  }

  function apply() {
    if (!plan) return;
    const { preset, models, sessions } = plan;
    startApplying(async () => {
      const result = await applyBulkIntensityPresetAction(entity, ids, preset.id, models);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOpen(false);
      const undo = result.data;
      toast(`${preset.name}: ${plural(models, "model")} in ${plural(sessions, "session")} — to review`, {
        action: {
          label: "Undo",
          onClick: async () => {
            const back = await undoBulkIntensityPresetAction(undo);
            if (!back.success) toast.error(back.error);
          },
        },
      });
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium transition-colors",
            "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <Layers className="h-3 w-3" aria-hidden="true" />
          Intensity preset…
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Intensity preset for {what}</DialogTitle>
          <DialogDescription>
            Ticks the preset&apos;s acts and sets its extras for the models not confirmed yet, where the cast fits its scenario.
            Nothing is taken away; they land <em>to review</em>.
          </DialogDescription>
        </DialogHeader>

        {choices === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {loading ? "Loading presets…" : null}
          </p>
        ) : choices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No presets yet —{" "}
            <Link href="/settings/catalogs/intensity#presets" className="underline underline-offset-2 hover:text-foreground">
              set one up
            </Link>{" "}
            first.
          </p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto" role="radiogroup" aria-label="Preset">
            {choices.map((s) => (
              <div key={s.id} className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">{s.name}</p>
                <div className="flex flex-wrap gap-1">
                  {s.presets.map((p) => {
                    const on = plan?.preset.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => pick(p.id)}
                        disabled={applying}
                        title={[p.description, plural(p.acts, "act")].filter(Boolean).join("\n")}
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                          on ? "border-primary bg-primary/15 font-medium" : "border-border hover:bg-muted/60",
                        )}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="min-h-16 rounded-lg bg-muted/30 px-3 py-2 text-sm" aria-live="polite">
          {plan ? (
            <>
              <p>
                <strong>{plan.preset.name}</strong> ({plan.preset.scenario}) for{" "}
                <strong>{plural(plan.models, "model")}</strong> in {plural(plan.sessions, "session")}.
              </p>
              {plan.confirmed > 0 && <p className="text-xs text-muted-foreground">{plural(plan.confirmed, "model")} already confirmed — left alone.</p>}
              {plan.otherCast > 0 && (
                <p className="text-xs text-muted-foreground">
                  {plural(plan.otherCast, "model")} whose cast suggests another scenario — left alone.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{loading && choices ? "Counting…" : "Pick a preset to see whom it reaches."}</p>
          )}
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!plan || plan.models === 0 || loading || applying}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {applying && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {plan ? `Apply to ${plural(plan.models, "model")}` : "Apply"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
