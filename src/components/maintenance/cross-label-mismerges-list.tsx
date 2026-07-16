import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { CrossLabelMisMerge } from "@/lib/services/maintenance-service";

/**
 * Surfaces staging sets that were promoted INTO a Set under a different owning
 * Label (a cross-label mis-merge, ADR-0020). The promote guard now prevents
 * this; any row here is a historical victim to un-merge manually. Read-only —
 * remediation is a deliberate recovery, not a one-click undo.
 */
export function CrossLabelMisMergesList({ rows }: { rows: CrossLabelMisMerge[] }) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-md backdrop-blur-sm">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle size={15} className="text-amber-400" />
        <h2 className="text-sm font-semibold">Cross-label mis-merges</h2>
        <span className="text-xs text-muted-foreground">({rows.length})</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        These staging sets were promoted into an existing Set under a{" "}
        <span className="font-medium text-amber-300/90">different owning label</span> —
        almost always a wrongful merge of two unrelated sets. The promote guard now
        blocks this; each row below needs a manual un-merge.
      </p>
      <ul className="divide-y divide-white/5">
        {rows.map((r) => (
          <li key={r.stagingSetId} className="flex items-center gap-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <span className="text-foreground/90">
                {r.stagingTitle}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  [{r.stagingLabel ?? "—"}]
                </span>
              </span>
              <span className="mx-2 text-amber-400/60">→ merged into</span>
              <Link
                href={`/sets/${r.setId}`}
                className="text-foreground/90 hover:text-primary"
              >
                {r.setTitle}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  [{r.setLabel ?? "—"}]
                </span>
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
