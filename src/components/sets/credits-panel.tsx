"use client";

import { useState } from "react";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import { AddCreditInline } from "@/components/sets/add-credit-inline";
import { LabelEvidenceManager } from "@/components/sets/label-evidence-manager";
import { CreditResolutionPanel } from "@/components/sets/credit-resolution-panel";

type CreditItem = {
  id: string;
  roleDefinitionId: string | null;
  roleName: string | null;
  rawName: string;
  resolutionStatus: "UNRESOLVED" | "RESOLVED" | "IGNORED";
  resolvedPerson: {
    id: string;
    icgId: string;
    aliases: { name: string; isCommon: boolean }[];
  } | null;
  resolvedArtist: { id: string; name: string } | null;
};

type LabelEvidenceItem = {
  setId: string;
  labelId: string;
  evidenceType: string;
  label: { id: string; name: string };
};

type RoleDefinitionOption = {
  id: string;
  name: string;
  groupName: string;
};

type CreditsPanelProps = {
  setId: string;
  channelId: string | null;
  credits: CreditItem[];
  labelEvidence: LabelEvidenceItem[];
  roleDefinitions: RoleDefinitionOption[];
};

export function CreditsPanel({
  setId,
  channelId,
  credits,
  labelEvidence,
  roleDefinitions,
}: CreditsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const unresolvedCount = credits.filter((c) => c.resolutionStatus === "UNRESOLVED").length;
  const hasCredits = credits.length > 0;

  return (
    <div className="rounded-2xl border border-white/20 bg-card/70 shadow-md backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <FileText size={15} className="text-muted-foreground" />
          <span className="text-sm font-semibold">
            Credits{hasCredits ? ` (${credits.length})` : ""}
          </span>
          {unresolvedCount > 0 && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              {unresolvedCount} unresolved
            </span>
          )}
        </div>
        {hasCredits && (
          <button
            type="button"
            onClick={() => setExpanded((o) => !o)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            {expanded ? (
              <>
                Collapse <ChevronUp size={12} />
              </>
            ) : (
              <>
                Manage <ChevronDown size={12} />
              </>
            )}
          </button>
        )}
      </div>

      {/* Always visible: label evidence + add credit */}
      <div className="p-4 space-y-4">
        <LabelEvidenceManager setId={setId} evidence={labelEvidence} />
        <AddCreditInline setId={setId} roleDefinitions={roleDefinitions} />

        {/* Collapsible resolution panel */}
        {expanded && hasCredits && (
          <div className="border-t border-white/10 pt-4">
            <CreditResolutionPanel setId={setId} channelId={channelId} credits={credits} />
          </div>
        )}

        {!hasCredits && (
          <p className="text-sm text-muted-foreground/60 italic">
            No credits yet. Add credits to track contributors.
          </p>
        )}
      </div>
    </div>
  );
}
