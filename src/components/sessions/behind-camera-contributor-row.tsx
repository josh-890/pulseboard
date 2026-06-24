import Link from "next/link";
import { Camera } from "lucide-react";

type BehindCameraContributorRowProps = {
  /** Resolved Artist id (links to /artists/[id]); null when the credit is still raw. */
  artistId: string | null;
  name: string;
  roleName: string;
};

/**
 * A read-only contributor row for a behind-camera Artist credit (ADR-0021). Unlike a
 * Person `ContributionParticipantRow`, these are derived from the session's set credits
 * and edited there — so no era / confidence / remove controls here.
 */
export function BehindCameraContributorRow({ artistId, name, roleName }: BehindCameraContributorRowProps) {
  const inner = (
    <div className="flex items-center justify-between rounded-xl px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Camera size={14} className="shrink-0 text-muted-foreground" />
        <span className="block truncate text-sm font-medium">{name}</span>
        {!artistId && (
          <span className="shrink-0 rounded-full border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            unresolved
          </span>
        )}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{roleName} · from set credit</span>
    </div>
  );

  if (!artistId) {
    return <li className="border border-transparent">{inner}</li>;
  }
  return (
    <li>
      <Link
        href={`/artists/${artistId}`}
        className="block rounded-xl border border-transparent transition-all hover:border-white/20 hover:bg-card/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {inner}
      </Link>
    </li>
  );
}
