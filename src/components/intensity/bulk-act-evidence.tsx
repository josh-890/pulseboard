"use client";

import { useState } from "react";
import { Gauge } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ActEvidenceList, type EvidenceAct, type EvidenceState } from "./act-evidence-list";

export type BulkActEvidenceProps = {
  acts: EvidenceAct[];
  selectedIds: string[];
  stateOf: (contributionActId: string, mediaIds: string[]) => EvidenceState;
  onToggle: (contributionActId: string, mediaIds: string[], linked: boolean) => void;
};

// "Act…" in a session gallery's selection bar (ADR-0036, 3b): the selected
// photos become evidence for a ticked act of one person — or stop being it.
export function BulkActEvidence({ acts, selectedIds, stateOf, onToggle }: BulkActEvidenceProps) {
  const [open, setOpen] = useState(false);
  const n = selectedIds.length;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={n === 0}>
          <Gauge size={14} aria-hidden="true" />
          Act…
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <p className="mb-1.5 px-1 text-[11px] text-muted-foreground">
          {n} selected photo{n === 1 ? "" : "s"} as evidence for…
        </p>
        <ActEvidenceList
          acts={acts}
          stateOf={(id) => stateOf(id, selectedIds)}
          onToggle={(id, linked) => onToggle(id, selectedIds, linked)}
        />
      </PopoverContent>
    </Popover>
  );
}
