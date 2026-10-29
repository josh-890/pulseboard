"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { matchArchiveNowAction } from "@/lib/actions/catalogue-load-actions";
import type { CatalogueMatchStatus } from "@/lib/services/catalogue-match-service";

type CatalogueMatchPanelProps = {
  status: CatalogueMatchStatus;
};

const when = (iso: string) => iso.slice(0, 16).replace("T", " ");
const SCOPE: Record<string, string> = {
  all: "every folder without a set",
  discoveredSince: "folders a scan just found",
  folders: "chosen folders",
};

/** The app's own archive matching (ADR-0038 S5): when it last ran, what it found, Match now */
export function CatalogueMatchPanel({ status }: CatalogueMatchPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const last = status.last;

  async function matchNow() {
    setBusy(true);
    try {
      await matchArchiveNowAction();
      toast.success("Matching started — it runs in the background; refresh in a minute");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-white/15 bg-card/40 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          {status.running ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={14} className="animate-spin" aria-hidden /> Matching now…
            </span>
          ) : last ? (
            <>
              Last matched <span className="font-medium">{when(last.at)}</span>
              <span className="text-muted-foreground"> · {SCOPE[last.scope] ?? last.scope}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Not matched yet — it runs after the next scan or catalogue run.</span>
          )}
        </p>
        <Button size="sm" variant="outline" disabled={busy || status.running} onClick={matchNow}>
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}
          Match now
        </Button>
      </div>
      {last && (
        <p className="text-xs tabular-nums text-muted-foreground">
          {last.folders.toLocaleString()} folders looked at · {last.matched.toLocaleString()} with a suggestion (
          {last.byTier.EXACT.toLocaleString()} exact, {last.byTier.STRONG.toLocaleString()} strong,{" "}
          {last.byTier.WEAK.toLocaleString()} weak) · {last.demoted.toLocaleString()} want a look ·{" "}
          {(last.durationMs / 1000).toFixed(1)} s ·{" "}
          <Link
            href="/archive/attribution"
            className="underline-offset-4 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:outline-none"
          >
            review the suggestions
          </Link>
        </p>
      )}
    </div>
  );
}
