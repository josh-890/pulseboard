import Link from "next/link";
import { deriveAppearanceAtShoot } from "@/lib/services/person-service";

type EraInfo = {
  id: string;
  label: string;
  date: Date | null;
  isBaseline: boolean;
};

type ContributionPerson = {
  id: string;
  icgId: string;
  aliases: { name: string }[];
  eras: (Parameters<typeof deriveAppearanceAtShoot>[0][number] & { id: string })[];
};

type ContributionParticipantRowProps = {
  contributionId: string;
  roleName: string;
  creditNameOverride: string | null;
  era: EraInfo | null;
  person: ContributionPerson;
  sessionDate: Date | null;
};

/**
 * Participant row on the session detail page. Shows the linked Era as a pill
 * (if any) and an appearance-at-shoot summary (hair / weight / build) derived
 * by point-in-time fold over the person's eras. ADR-0004 + ADR-0001.
 */
export function ContributionParticipantRow({
  contributionId,
  roleName,
  creditNameOverride,
  era,
  person,
  sessionDate,
}: ContributionParticipantRowProps) {
  const commonAlias = person.aliases[0]?.name ?? null;
  const displayName = commonAlias ?? person.icgId;
  const creditedAs =
    creditNameOverride && creditNameOverride !== commonAlias ? creditNameOverride : null;

  // asOf = latest member-delta date within the linked Era. For a baseline
  // (dateless) Era, fall back to the session date — baseline is "time zero"
  // for the person, and the session date is the only concrete cutoff we have.
  // No Era linked → no snapshot (we don't presume "current" was correct then).
  let asOf: Date | null = null;
  if (era) {
    if (era.isBaseline) {
      asOf = sessionDate;
    } else {
      const matchingEra = person.eras.find((e) => e.id === era.id);
      const memberDates = (matchingEra?.scalarDeltas ?? [])
        .map((d) => d.date)
        .filter((d): d is Date => d !== null);
      asOf = memberDates.length > 0
        ? memberDates.reduce((a, b) => (a > b ? a : b))
        : (era.date ?? sessionDate);
    }
  }
  const snapshot = era ? deriveAppearanceAtShoot(person.eras, asOf) : null;

  const snapshotParts: string[] = [];
  if (snapshot?.hairColor) snapshotParts.push(snapshot.hairColor);
  if (snapshot?.weight) snapshotParts.push(`${snapshot.weight} kg`);
  if (snapshot?.build) snapshotParts.push(snapshot.build);

  return (
    <li key={contributionId}>
      <Link
        href={`/people/${person.id}`}
        className="group flex flex-col gap-1 rounded-lg border border-transparent px-3 py-1.5 transition-all hover:border-white/15 hover:bg-card/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center rounded-full border border-white/15 bg-muted/50 px-2 py-0.5 text-xs font-medium shrink-0 text-muted-foreground">
            {roleName}
          </span>
          <span className="text-sm font-medium text-foreground/90 group-hover:text-primary transition-colors">
            {displayName}
            {creditedAs && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground/70 italic">
                as: {creditedAs}
              </span>
            )}
          </span>
          {era && (
            <span
              className="ml-auto inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400"
              title={
                era.isBaseline
                  ? "Person was in their baseline phase at this shoot"
                  : `Linked Era: ${era.label}${era.date ? ` (${new Date(era.date).getUTCFullYear()})` : ""}`
              }
            >
              {era.isBaseline ? "Baseline" : era.label}
            </span>
          )}
        </div>
        {snapshotParts.length > 0 && (
          <p className="pl-1 text-[11px] text-muted-foreground/70">
            at-shoot: {snapshotParts.join(" · ")}
          </p>
        )}
      </Link>
    </li>
  );
}
