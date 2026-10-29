"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { retryCoversAction } from "@/lib/actions/catalogue-load-actions";
import type { AgentPass, CoverRequestStats, UnsettledCover } from "@/lib/services/catalogue-cover-service";

type CatalogueAgentPanelProps = {
  pass: AgentPass | null;
  /** A pass is running now (started at), else null */
  runningSince: string | null;
  stats: CoverRequestStats;
  unsettled: UnsettledCover[];
};

const when = (iso: string) => iso.slice(0, 16).replace("T", " ");
/** A pass every 15 minutes: an hour without one means the task or the box is off */
const STALE_MS = 60 * 60_000;

/** The scheduled catalogue agent and covers on request (ADR-0038 S7) */
export function CatalogueAgentPanel({ pass, runningSince, stats, unsettled }: CatalogueAgentPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Captured once per render on the server's data; good enough for "is it stale"
  const [now] = useState(() => Date.now());
  // A pass running now is a sign of life too
  const stale = !runningSince && (pass ? now - new Date(pass.at).getTime() > STALE_MS : true);

  async function retry() {
    setBusy(true);
    try {
      const res = await retryCoversAction();
      toast.success(`${res.count} covers asked for again — with the next pass`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-white/15 bg-card/40 px-4 py-3 text-sm">
      <p>
        {pass ? (
          <>
            Last pass <span className="font-medium">{when(pass.at)}</span>
            <span className="text-muted-foreground">
              {" "}
              · {pass.runId ? `${pass.foldersSent.toLocaleString()} changed folders sent` : "catalogue unchanged"} ·{" "}
              {pass.coversDelivered} covers delivered · {(pass.durationMs / 1000).toFixed(0)} s
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">No scheduled pass yet — set up the task on the Windows box (docs/agents.md).</span>
        )}
      </p>
      {runningSince && (
        <p className="inline-flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-300">
          <Loader2 size={13} className="animate-spin" aria-hidden /> Pass running since {when(runningSince)} — the walk takes
          a few minutes
        </p>
      )}
      {pass && stale && (
        <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle size={13} aria-hidden /> No pass for over an hour — is the Windows box on and the task running?
        </p>
      )}
      {pass?.error && (
        <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle size={13} aria-hidden /> {pass.error}
        </p>
      )}
      <p className="text-xs tabular-nums text-muted-foreground">
        Covers: <span className="text-foreground">{stats.WANTED.toLocaleString()}</span> on the way ·{" "}
        {stats.deliveredToday.toLocaleString()} delivered in 24 h · {stats.NOT_FOUND.toLocaleString()} not in the catalogue ·{" "}
        {stats.FAILED.toLocaleString()} damaged
      </p>
      {unsettled.length > 0 && (
        <>
          <ul className="divide-y divide-white/10">
            {unsettled.map((u) => (
              <li key={u.stagingSetId} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
                <Link
                  href={`/staging-sets?select=${u.stagingSetId}`}
                  className="min-w-0 flex-1 truncate hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  {u.title} <span className="text-muted-foreground">({u.coverId})</span>
                </Link>
                <span className="text-xs text-muted-foreground">
                  {u.status === "FAILED" ? "damaged" : "not found"}
                  {u.detail && ` — ${u.detail}`}
                </span>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="outline" disabled={busy} onClick={retry}>
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RotateCcw size={14} aria-hidden />}
            Ask again
          </Button>
        </>
      )}
    </div>
  );
}
