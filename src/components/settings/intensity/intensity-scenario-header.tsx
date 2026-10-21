"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, MoreHorizontal, Trash2 } from "lucide-react";
import { InlineEditable } from "@/components/shared/inline-editable";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteIntensityScenarioAction,
  moveIntensityScenarioAction,
  renameIntensityScenarioAction,
} from "@/lib/actions/intensity-catalog-actions";
import type { IntensityCatalog } from "@/lib/services/intensity-catalog-service";
import { cn } from "@/lib/utils";
import { useCatalogCall } from "./use-catalog-call";

export type IntensityScenarioHeaderProps = {
  scenario: IntensityCatalog["scenarios"][number];
  isFirst: boolean;
  isLast: boolean;
  /** This scenario alone fills the width */
  focused: boolean;
  onFocusChange: (focused: boolean) => void;
};

// The head of a scenario column: ‹ ⋯ name ⤢ ›. Rename in place, move
// left/right, work in it alone at full width (focus). Delete sits in the ⋯
// menu, away from the everyday buttons, and asks first; it is refused while
// any of its acts is ticked in a session.
export function IntensityScenarioHeader({ scenario, isFirst, isLast, focused, onFocusChange }: IntensityScenarioHeaderProps) {
  const { call, run } = useCatalogCall();
  const [confirming, setConfirming] = useState(false);
  const used = scenario.acts.reduce((n, a) => n + a._count.contributions, 0);
  const actCount = scenario.acts.length;

  return (
    <div role="columnheader" aria-label={`Scenario ${scenario.name}`} className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => run(() => moveIntensityScenarioAction(scenario.id, -1))}
        disabled={isFirst || focused}
        aria-label={`Move ${scenario.name} left`}
        className="rounded p-1 text-muted-foreground hover:text-foreground disabled:invisible"
      >
        <ChevronLeft size={14} aria-hidden="true" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`More for ${scenario.name}`}
            className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <MoreHorizontal size={14} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem variant="destructive" disabled={used > 0} onSelect={() => setConfirming(true)}>
            <Trash2 aria-hidden="true" />
            {used > 0 ? "Acts ticked in sessions — cannot delete" : "Delete scenario…"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <InlineEditable
        value={scenario.name}
        onSave={(name) => call(() => renameIntensityScenarioAction(scenario.id, name))}
        className="min-w-0 flex-1 px-1 text-center"
      >
        <span className="truncate text-sm font-semibold">{scenario.name}</span>
      </InlineEditable>
      <button
        type="button"
        onClick={() => onFocusChange(!focused)}
        aria-label={focused ? "Show all scenarios" : `Work in ${scenario.name} only`}
        aria-pressed={focused}
        title={focused ? "Show all scenarios" : `Work in ${scenario.name} only — full width`}
        className={cn(
          "rounded p-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          focused ? "bg-primary/10 text-primary" : "text-muted-foreground",
        )}
      >
        {focused ? <Minimize2 size={13} aria-hidden="true" /> : <Maximize2 size={13} aria-hidden="true" />}
      </button>
      <button
        type="button"
        onClick={() => run(() => moveIntensityScenarioAction(scenario.id, 1))}
        disabled={isLast || focused}
        aria-label={`Move ${scenario.name} right`}
        className="rounded p-1 text-muted-foreground hover:text-foreground disabled:invisible"
      >
        <ChevronRight size={14} aria-hidden="true" />
      </button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the scenario {scenario.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {actCount === 0
                ? "It has no acts."
                : `Its ${actCount} ${actCount === 1 ? "act goes" : "acts go"} with it — titles, levels and descriptions.`}{" "}
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (focused) onFocusChange(false);
                run(() => deleteIntensityScenarioAction(scenario.id));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
