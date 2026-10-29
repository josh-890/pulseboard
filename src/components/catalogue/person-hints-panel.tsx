"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { checkPersonFilesAction } from "@/lib/actions/catalogue-load-actions";
import type { PersonHintRow } from "@/lib/services/catalogue-develop-service";

type PersonHintsPanelProps = {
  rows: PersonHintRow[];
  /** Person folders whose file is not weighed yet */
  unweighed: number;
  running: boolean;
};

/** Developed Persons a newer catalogue file waits for (ADR-0038 S6) — hint only, reviewed on her page */
export function PersonHintsPanel({ rows, unweighed, running }: PersonHintsPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    try {
      await checkPersonFilesAction();
      toast.success("Checking her files in the background — refresh in a minute");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-white/15 bg-card/40 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          {running ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={14} className="animate-spin" aria-hidden /> Checking files…
            </span>
          ) : rows.length === 0 ? (
            <span className="text-muted-foreground">No Person has a newer catalogue file.</span>
          ) : (
            <>
              <span className="font-medium tabular-nums">{rows.length.toLocaleString()}</span> Person
              {rows.length === 1 ? " has" : "s have"} a newer catalogue file
            </>
          )}
          {unweighed > 0 && !running && (
            <span className="text-muted-foreground"> · {unweighed.toLocaleString()} not checked yet</span>
          )}
        </p>
        {unweighed > 0 && (
          <Button size="sm" variant="outline" disabled={busy || running} onClick={check}>
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}
            Check now
          </Button>
        )}
      </div>
      {rows.length > 0 && (
        <ul className="divide-y divide-white/10 text-sm">
          {rows.map((r) => (
            <li key={r.personId} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
              <Link
                href={`/people/${r.personId}`}
                className="min-w-0 flex-1 truncate font-medium hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {r.name} <span className="font-normal text-muted-foreground">({r.icgId})</span>
              </Link>
              <span className="text-xs tabular-nums text-muted-foreground">
                {[r.newSets > 0 && `${r.newSets} new sets`, r.changedValues > 0 && `${r.changedValues} changed values`]
                  .filter(Boolean)
                  .join(" · ")}
                {r.fileDate && ` · file ${r.fileDate}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
