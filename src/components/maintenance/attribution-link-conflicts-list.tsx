import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { PersonIdentity } from "@/components/shared/person-identity";
import type { AttributionLinkConflict } from "@/lib/services/maintenance-service";

/**
 * Folders whose confirmed attribution contradicts the set they are linked to.
 *
 * Read-only, and deliberately takes no side. An import participant list can be
 * genuinely incomplete (an uncredited second model), and a folder attribution is
 * the archive owner's own assertion (ADR-0027) — so the row states both claims
 * and leaves the verdict to the operator. What is *not* acceptable is what
 * happens today: the contradiction is written silently, and which of the two
 * survives depends on which side was touched last.
 */
export function AttributionLinkConflictsList({ rows }: { rows: AttributionLinkConflict[] }) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-md backdrop-blur-sm">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle size={15} className="text-amber-400" />
        <h2 className="text-sm font-semibold">Attribution vs. linked set</h2>
        <span className="text-xs text-muted-foreground">({rows.length})</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        You attributed these archive folders to a person the set they are linked to does
        not list. Neither side is automatically right — an import list can be incomplete,
        and a folder attribution is your own assertion — but nobody was asked, and on
        promote the set&apos;s own list is what survives.{" "}
        <Link href="/archive/conflicts" className="underline underline-offset-2 hover:text-foreground">
          Decide them with the covers in view
        </Link>
        .
      </p>
      <ul className="divide-y divide-white/5">
        {rows.map((r) => (
          <li key={`${r.folderId}-${r.attributedIcgId}`} className="py-2 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="truncate text-foreground/90" title={r.fullPath}>
                {r.folderName}
              </span>
              <span className="text-xs text-muted-foreground">attributed to</span>
              <PersonIdentity
                name={r.attributedName}
                icgId={r.attributedIcgId}
                className="text-amber-300/90"
              />
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
              <span>linked to</span>
              {r.kind === "set" ? (
                <Link href={`/sets/${r.targetId}`} className="text-foreground/80 hover:text-primary">
                  {r.targetTitle}
                </Link>
              ) : (
                <Link href="/staging-sets" className="text-foreground/80 hover:text-primary">
                  {r.targetTitle}
                </Link>
              )}
              <span className="rounded bg-white/5 px-1 py-px text-[10px] uppercase tracking-wide">
                {r.kind === "set" ? "set" : "staging"}
              </span>
              <span>which lists</span>
              <span className="text-foreground/80">{r.targetParticipants ?? "—"}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
