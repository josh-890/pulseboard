"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import { AddCreditInline } from "@/components/sets/add-credit-inline";
import { CreditResolutionPanel } from "@/components/sets/credit-resolution-panel";
import { resolveCreditedAs } from "@/lib/sets/credited-as";
import { cn } from "@/lib/utils";

type CreditItem = {
  id: string;
  roleDefinitionId: string | null;
  roleName: string | null;
  roleGroupName: string | null;
  rawName: string;
  resolutionStatus: "UNRESOLVED" | "RESOLVED" | "IGNORED";
  resolvedAlias: { id: string; name: string } | null;
  resolvedPerson: {
    id: string;
    icgId: string;
    aliases: { name: string; isCommon: boolean }[];
  } | null;
  resolvedArtist: { id: string; name: string } | null;
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
  roleDefinitions: RoleDefinitionOption[];
};

function CreditRow({ credit }: { credit: CreditItem }) {
  const isUnresolved = credit.resolutionStatus === "UNRESOLVED";
  const personId = credit.resolvedPerson?.id;
  const commonName = credit.resolvedPerson?.aliases.find((a) => a.isCommon)?.name ?? null;
  const displayName = credit.resolvedPerson
    ? (commonName ?? credit.resolvedPerson.icgId)
    : credit.resolvedArtist?.name ?? credit.rawName;

  // "as X" evidence line — only for resolved persons (ADR-0024 precedence).
  const creditedAs = credit.resolvedPerson ? resolveCreditedAs(credit, commonName) : null;

  const roleLabel = credit.roleName ?? (credit.resolvedArtist ? "Artist" : null);

  const inner = (
    <>
      {roleLabel && (
        <span className="inline-flex shrink-0 items-center rounded-full border border-white/15 bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {roleLabel}
        </span>
      )}
      <span
        className={cn(
          "text-sm font-medium truncate",
          isUnresolved
            ? "text-muted-foreground/60 italic"
            : "text-foreground/90",
        )}
      >
        {displayName}
      </span>
      {creditedAs && (
        <span className="shrink-0 text-xs italic text-muted-foreground/70">
          as {creditedAs}
        </span>
      )}
    </>
  );

  if (personId) {
    return (
      <Link
        href={`/people/${personId}`}
        className="group flex items-center gap-2.5 rounded-lg border border-transparent px-3 py-1 transition-all hover:border-white/15 hover:bg-card/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2.5 px-3 py-1">
      {inner}
    </div>
  );
}

export function CreditsPanel({
  setId,
  channelId,
  credits,
  roleDefinitions,
}: CreditsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleCredits = credits.filter((c) => c.resolutionStatus !== "IGNORED");
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
              <>Collapse <ChevronUp size={12} /></>
            ) : (
              <>Manage <ChevronDown size={12} /></>
            )}
          </button>
        )}
      </div>

      {/* Flat credits list — always visible */}
      {visibleCredits.length > 0 && (
        <div className="pt-2 pb-1">
          {visibleCredits.map((credit) => (
            <CreditRow key={credit.id} credit={credit} />
          ))}
        </div>
      )}

      {/* Management tools */}
      <div className={cn("px-4 pb-4 space-y-4", visibleCredits.length > 0 ? "pt-3 border-t border-white/10" : "pt-4")}>
        <AddCreditInline setId={setId} roleDefinitions={roleDefinitions} />

        {!hasCredits && (
          <p className="text-sm text-muted-foreground/60 italic">
            No credits yet. Add credits to track contributors.
          </p>
        )}

        {/* Collapsible resolution panel */}
        {expanded && hasCredits && (
          <div className="border-t border-white/10 pt-4">
            <CreditResolutionPanel setId={setId} channelId={channelId} credits={credits} />
          </div>
        )}
      </div>
    </div>
  );
}
