import { cn } from "@/lib/utils";
import type { getPersonWithDetails } from "@/lib/services/person-service";

type PersonaItem = NonNullable<Awaited<ReturnType<typeof getPersonWithDetails>>>["personas"][number];

type PersonaTimelineEntryProps = {
  persona: PersonaItem;
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function PersonaTimelineEntry({ persona }: PersonaTimelineEntryProps) {
  const hasPhysical = !!persona.physicalChange;
  const physicalFields = hasPhysical
    ? [
        persona.physicalChange?.currentHairColor ? `Hair: ${persona.physicalChange.currentHairColor}` : null,
        persona.physicalChange?.weight ? `Weight: ${persona.physicalChange.weight} kg` : null,
        persona.physicalChange?.build ? `Build: ${persona.physicalChange.build}` : null,
        persona.physicalChange?.visionAids ? `Vision aids: ${persona.physicalChange.visionAids}` : null,
        persona.physicalChange?.fitnessLevel ? `Fitness: ${persona.physicalChange.fitnessLevel}` : null,
      ].filter(Boolean)
    : [];

  return (
    <div className="relative pl-6">
      {/* Timeline dot */}
      <div
        className={cn(
          "absolute left-0 top-2 h-3 w-3 rounded-full border-2",
          persona.isBaseline
            ? "border-primary bg-primary"
            : "border-muted-foreground/40 bg-muted-foreground/20",
        )}
        aria-hidden="true"
      />

      <div className="rounded-xl border border-white/10 bg-card/40 p-4">
        {/* Header */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="font-medium">{persona.label}</span>
          {persona.isBaseline && (
            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Baseline
            </span>
          )}
          {persona.date && (
            <span className="inline-flex items-center rounded-full border border-white/15 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
              {formatDate(persona.date)}
            </span>
          )}
        </div>

        {/* Notes */}
        {persona.notes && (
          <p className="mb-2 text-sm text-muted-foreground italic">{persona.notes}</p>
        )}

        {/* Physical changes */}
        {physicalFields.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Physical changes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {physicalFields.map((field) => (
                <span
                  key={field}
                  className="inline-flex items-center rounded-full border border-white/10 bg-muted/50 px-2.5 py-0.5 text-xs text-foreground/80"
                >
                  {field}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Body mark events */}
        {persona.bodyMarkEvents.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Body marks
            </p>
            <div className="space-y-0.5">
              {persona.bodyMarkEvents.map((event) => (
                <p key={event.id} className="text-sm text-foreground/80">
                  <span className="capitalize font-medium text-muted-foreground">{event.eventType}</span>
                  {" — "}
                  <span className="capitalize">{event.bodyMark.type}</span>
                  {event.bodyMark.motif ? `, ${event.bodyMark.motif}` : ""}
                  {event.bodyMark.side ? `, ${event.bodyMark.side} ${event.bodyMark.bodyRegion}` : `, ${event.bodyMark.bodyRegion}`}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Digital identity changes */}
        {persona.digitalIdentities.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Digital identities
            </p>
            <div className="space-y-0.5">
              {persona.digitalIdentities.map((di) => (
                <p key={di.id} className="text-sm text-foreground/80">
                  <span className="font-medium">{di.platform}</span>
                  {di.handle ? ` — ${di.handle}` : ""}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Skill changes */}
        {persona.skills.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              Skills
            </p>
            <div className="flex flex-wrap gap-1.5">
              {persona.skills.map((skill) => (
                <span
                  key={skill.id}
                  className="inline-flex items-center rounded-full border border-white/10 bg-muted/50 px-2.5 py-0.5 text-xs text-foreground/80"
                >
                  {skill.name}
                  {skill.level ? ` · ${skill.level}` : ""}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
