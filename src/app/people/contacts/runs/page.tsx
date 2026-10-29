import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertTriangle, DatabaseBackup } from "lucide-react";
import { getCurrentTenantId, withTenantFromHeaders } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";
import {
  getBackupStatus,
  getProblemSummary,
  getProblems,
  listRuns,
} from "@/lib/services/catalogue-load-service";
import { PROBLEM_KINDS, isQuarantine, type ProblemCode } from "@/lib/services/catalogue-inventory";
import { CatalogueUndoButton } from "@/components/catalogue/catalogue-undo-button";
import { CatalogueMatchPanel } from "@/components/catalogue/catalogue-match-panel";
import { getCatalogueMatchStatus } from "@/lib/services/catalogue-match-service";

export const dynamic = "force-dynamic";

type RunsPageProps = { searchParams: Promise<{ code?: string }> };

const when = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") : "—");
const STATUS_STYLE: Record<string, string> = {
  RUNNING: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  DONE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  FAILED: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  UNDONE: "bg-muted text-muted-foreground",
};

/** Catalogue runs (ADR-0038 S3): what each run did, the current problem list, Undo */
export default async function CatalogueRunsPage({ searchParams }: RunsPageProps) {
  return withTenantFromHeaders(async () => {
    const { code } = await searchParams;
    const [runs, summary, backup, match] = await Promise.all([
      listRuns(),
      getProblemSummary(),
      getBackupStatus(),
      getCatalogueMatchStatus(getCurrentTenantId()),
    ]);
    const selected = code && summary.some((s) => s.code === code) ? code : summary[0]?.code;
    const problems = selected ? await getProblems(selected) : [];
    const undoable = runs.find((r) => r.status !== "UNDONE");

    return (
      <div className="space-y-8">
        <Link
          href="/people/contacts"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        >
          <ArrowLeft size={14} aria-hidden /> Contacts
        </Link>
        <div>
          <h1 className="text-2xl font-bold leading-tight">Catalogue runs</h1>
          <p className="text-sm text-muted-foreground">
            What each load of the person catalogue did, what is wrong in it now, and Undo — latest run first.
          </p>
        </div>

        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <DatabaseBackup size={15} aria-hidden />
          Last prod backup: <span className="text-foreground">{when(backup.lastAt)}</span>
          {runs.length === 0 && !backup.fresh && (
            <span className="text-amber-600 dark:text-amber-400">
              — the first load needs one from the last 24 hours: <code>bash scripts/tenant-backup.sh xpulse</code>
            </span>
          )}
        </p>

        <section aria-labelledby="runs-heading" className="space-y-2">
          <h2 id="runs-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Runs
          </h2>
          {runs.length === 0 ? (
            <p className="rounded-xl border border-white/15 bg-card/40 px-4 py-3 text-sm text-muted-foreground">
              No run yet. Start one on the Windows box: <code>node catalogue-load.mjs</code>
            </p>
          ) : (
            <ul className="space-y-2">
              {runs.map((r) => {
                const c = r.counts;
                return (
                  <li key={r.id} className={cn("rounded-xl border border-white/15 bg-card/40 px-4 py-3", r.status === "UNDONE" && "opacity-60")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_STYLE[r.status])}>
                          {r.status.toLowerCase()}
                        </span>
                        <span className="font-medium">{when(r.startedAt)}</span>
                        <span className="text-muted-foreground">· {r.mode === "first" ? "first load" : r.mode === "all" ? "full pass" : "changes only"}</span>
                        {r.finishedAt && <span className="text-muted-foreground">· finished {when(r.finishedAt)}</span>}
                        {r.undoneAt && <span className="text-muted-foreground">· undone {when(r.undoneAt)}</span>}
                      </div>
                      {undoable?.id === r.id && r.status !== "RUNNING" && <CatalogueUndoButton runId={r.id} />}
                    </div>
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                      {c.folders.toLocaleString()} folders · {c.new.toLocaleString()} new · {c.enriched.toLocaleString()} enriched ·{" "}
                      {c.persons.toLocaleString()} Persons (hint only) · {c.quarantined.toLocaleString()} quarantined ·{" "}
                      {c.flagged.toLocaleString()} flagged · sets {c.setsNew.toLocaleString()} new, {c.setsUpdated.toLocaleString()} updated ·{" "}
                      {c.gone.toLocaleString()} gone
                      {c.failed > 0 && <span className="text-destructive"> · {c.failed} failed</span>}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="match-heading" className="space-y-2">
          <h2 id="match-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Archive matching
          </h2>
          <p className="text-xs text-muted-foreground">
            Archive folders without a set are matched against the catalogue sets after every scan and every catalogue run:
            date, then channel, alias and title as evidence. Folders you decided are never reopened.
          </p>
          <CatalogueMatchPanel status={match} />
        </section>

        <section aria-labelledby="problems-heading" className="space-y-3">
          <h2 id="problems-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Problems now
          </h2>
          {summary.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl border border-white/15 bg-card/40 px-4 py-3 text-sm">
              <CheckCircle2 size={16} className="text-emerald-500" aria-hidden /> No problems in the loaded catalogue.
            </p>
          ) : (
            <>
              <nav aria-label="Problem kinds" className="flex flex-wrap gap-1.5">
                {summary.map((s) => {
                  const kind = PROBLEM_KINDS[s.code as ProblemCode];
                  return (
                    <Link
                      key={s.code}
                      href={`/people/contacts/runs?code=${s.code}`}
                      aria-current={s.code === selected ? "page" : undefined}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        s.code === selected ? "border-primary bg-primary/10 text-foreground" : "border-white/15 bg-card/40 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {kind && isQuarantine(s.code as ProblemCode) && <AlertTriangle size={11} className="text-amber-500" aria-label="quarantine" />}
                      <span className="font-mono">{s.code}</span> {kind?.title ?? ""}
                      <span className="tabular-nums">{s.count}</span>
                    </Link>
                  );
                })}
              </nav>
              <p className="text-xs text-muted-foreground">
                Quarantined folders (Q) bring no Contact; flagged ones (F) do, with the broken part marked. Fix the file on
                the catalogue drive and run again — a fixed folder drops off this list.
              </p>
              <ul className="divide-y divide-white/10 rounded-xl border border-white/15 bg-card/40" aria-label={`Problems ${selected}`}>
                {problems.map((p) => (
                  <li key={p.id} className="space-y-0.5 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium">{p.folder.path}</span>
                      {p.line && <span className="text-xs text-muted-foreground">line {p.line}</span>}
                      {p.folder.goneAt && <span className="text-xs text-muted-foreground">· folder gone</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{p.detail}</p>
                    {p.example && <p className="truncate font-mono text-[11px] text-muted-foreground/80">{p.example}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    );
  });
}
