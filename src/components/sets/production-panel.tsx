import Link from "next/link";
import { Clapperboard, Building2 } from "lucide-react";
import { formatPartialDateISO } from "@/lib/utils";

type SessionRow = {
  sessionId: string;
  name: string;
  date: Date | null;
  datePrecision: string;
  isPrimary: boolean;
  // Producer (ADR-0025): the session's single owning Label.
  producerLabel: { id: string; name: string } | null;
};

type ProductionPanelProps = {
  sessions: SessionRow[];
  // Publisher (ADR-0025): the set's channel's current owning Label.
  publisherLabel: { id: string; name: string } | null;
};

// ADR-0025 — the production/publication story for a Set. Each Session shows its
// Producer (its single Label); the set's Publisher is its channel's owner. When
// a producer differs from the publisher, that's cross-label publication, shown
// as an explicit "Published via …" line rather than hidden or fabricated.
export function ProductionPanel({ sessions, publisherLabel }: ProductionPanelProps) {
  if (sessions.length === 0) return null;

  // Cross-label publication: any producer Label that isn't the publisher.
  const producerIds = new Set(sessions.map((s) => s.producerLabel?.id).filter(Boolean));
  const diverges = publisherLabel != null && producerIds.size > 0 && !producerIds.has(publisherLabel.id);

  return (
    <div className="rounded-2xl border border-white/20 bg-card/70 p-4 shadow-md backdrop-blur-sm">
      <div className="mb-3 flex items-center gap-2">
        <Clapperboard size={14} className="text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Production</h2>
      </div>

      <div className="space-y-2">
        {sessions.map((s) => (
          <Link
            key={s.sessionId}
            href={`/sessions/${s.sessionId}`}
            className="group block rounded-xl border border-white/15 bg-card/40 px-3 py-2.5 transition-all hover:border-white/25 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="block min-w-0 truncate text-sm font-medium transition-colors group-hover:text-entity-session">
                {s.name}
              </span>
              <div className="ml-2 flex shrink-0 items-center gap-2">
                {s.isPrimary && (
                  <span className="rounded-full border border-entity-session/20 bg-entity-session/10 px-2 py-0.5 text-xs font-medium text-entity-session">
                    Primary
                  </span>
                )}
                {s.date && (
                  <span className="text-xs text-muted-foreground">
                    {formatPartialDateISO(s.date, s.datePrecision)}
                  </span>
                )}
              </div>
            </div>
            {/* Producer label (ADR-0025) */}
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 size={11} className="shrink-0" aria-hidden="true" />
              {s.producerLabel ? (
                <span>Produced by {s.producerLabel.name}</span>
              ) : (
                <span className="italic text-muted-foreground/60">Producer not set</span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {/* Cross-label publication — publisher differs from producer(s) */}
      {diverges && publisherLabel && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600/90 dark:text-amber-400/90">
          <Building2 size={11} className="shrink-0" aria-hidden="true" />
          Published via {publisherLabel.name} (different label)
        </p>
      )}
    </div>
  );
}
