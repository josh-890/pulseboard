"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { InlineEditable } from "@/components/shared/inline-editable";
import {
  deleteIntensityActAction,
  getIntensityActUsageAction,
  moveIntensityActsAction,
  updateIntensityActAction,
} from "@/lib/actions/intensity-catalog-actions";
import { formatIntensity, intensityCap } from "@/lib/intensity";
import type {
  IntensityActUsage,
  IntensityCatalog,
} from "@/lib/services/intensity-catalog-service";
import { formatPartialDateISO } from "@/lib/utils";
import { IntensityStepInput } from "./intensity-step-input";
import { useCatalogCall } from "./use-catalog-call";
import { IntensityPanelShell } from "./intensity-panel-shell";

export type IntensityActPanelProps = {
  act: IntensityCatalog["scenarios"][number]["acts"][number];
  scenarioId: string;
  /** The top of the scale — a level goes up to half a step below */
  max: number;
  scenarios: { id: string; name: string }[];
  onClose: () => void;
  /** The previous / next card in reading order; null at the end */
  onStep: (step: 1 | -1) => void;
  canStep: { prev: boolean; next: boolean };
  className?: string;
};

const LABEL = "text-muted-foreground block text-xs font-medium";

// The act's own panel (K2, like a side-peek in Linear or Notion): everything
// about one act in one place — name, description, level as a number, scenario,
// where it is ticked, delete. The board beside it stays usable.
export function IntensityActPanel({
  act,
  scenarioId,
  max,
  scenarios,
  onClose,
  onStep,
  canStep,
  className,
}: IntensityActPanelProps) {
  const router = useRouter();
  const { call } = useCatalogCall();
  const used = act._count.contributions;
  const [usage, setUsage] = useState<{
    actId: string;
    rows: IntensityActUsage;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const loading = usage?.actId !== act.id;

  // Read where it is ticked whenever another act opens (or its count changes)
  useEffect(() => {
    let alive = true;
    void getIntensityActUsageAction(act.id).then((rows) => {
      if (alive) setUsage({ actId: act.id, rows });
    });
    return () => {
      alive = false;
    };
  }, [act.id, used]);

  async function changeScenario(to: string) {
    if (to === scenarioId) return;
    const result = await moveIntensityActsAction([act.id], {
      scenarioId: to,
      level: act.level,
      beforeId: null,
    });
    if (!result.success) {
      toast.error(result.error ?? "Could not move the act");
      return;
    }
    router.refresh();
  }

  return (
    <IntensityPanelShell
      label={`Act ${act.name}`}
      heading={
        <InlineEditable
          value={act.name}
          onSave={(name) =>
            call(() => updateIntensityActAction(act.id, { name }))
          }
          className="px-1 text-base font-semibold"
        >
          <h3 className="break-words">{act.name}</h3>
        </InlineEditable>
      }
      stepNoun="act"
      onStep={onStep}
      canStep={canStep}
      onClose={onClose}
      className={className}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className={LABEL}>Scenario</span>
          <select
            value={scenarioId}
            onChange={(e) => void changeScenario(e.target.value)}
            aria-label={`Scenario of ${act.name}`}
            className="bg-muted/30 focus:ring-ring h-7 w-full rounded-md border border-white/15 px-1.5 text-sm focus:ring-1 focus:outline-none"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-1">
          <span className={LABEL}>Level</span>
          <IntensityStepInput
            key={`${act.id}-${act.level}`}
            value={act.level}
            label={`Level of ${act.name}`}
            max={intensityCap(max)}
            onCommit={(level) =>
              call(() => updateIntensityActAction(act.id, { level }))
            }
          />
        </div>
      </div>

      <div className="space-y-1">
        <span className={LABEL}>Description</span>
        <InlineEditable
          type="textarea"
          value={act.description ?? ""}
          onSave={(description) =>
            call(() => updateIntensityActAction(act.id, { description }))
          }
          placeholder="What it means…"
          className="px-1 text-sm"
        >
          {act.description ? (
            <span className="whitespace-pre-line">{act.description}</span>
          ) : (
            <span className="text-muted-foreground italic">
              Add a description
            </span>
          )}
        </InlineEditable>
      </div>

      <div className="space-y-1.5">
        <span className={LABEL}>
          Ticked in {used} {used === 1 ? "session" : "sessions"}
        </span>
        {loading
          ? used > 0 && (
              <Loader2
                size={14}
                className="text-muted-foreground animate-spin"
                aria-label="Loading"
              />
            )
          : usage.rows.length > 0 && (
              <ul
                aria-label={`Where ${act.name} is ticked`}
                className="max-h-64 space-y-1 overflow-y-auto pr-1"
              >
                {usage.rows.map((r) => (
                  <li key={r.id} className="text-sm">
                    <Link
                      href={`/sessions/${r.session.id}`}
                      className="hover:bg-muted/40 block rounded-md px-1.5 py-1"
                    >
                      <span className="font-medium">
                        {r.person.name} ({r.person.icgId})
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {formatPartialDateISO(
                          r.session.date,
                          r.session.datePrecision,
                        ) || "Undated"}{" "}
                        · {r.session.name}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
      </div>

      <div className="mt-auto border-t border-white/10 pt-3">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={used > 0}
          title={
            used > 0
              ? "Ticked in sessions — replace or archive will come"
              : undefined
          }
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Trash2 size={14} aria-hidden="true" /> Delete act…
        </button>
        {used > 0 && (
          <p className="text-muted-foreground mt-1 text-xs">
            Ticked in sessions, so it stays — replacing or archiving it comes
            next.
          </p>
        )}
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the act {act.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Level {formatIntensity(act.level)}, its title and description go.
              No session has it ticked. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onClose();
                void call(() => deleteIntensityActAction(act.id)).catch(
                  () => {},
                );
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </IntensityPanelShell>
  );
}
