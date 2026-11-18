import Link from "next/link";
import { EntityMark } from "@/components/shared/entity-mark";
import { TrailScope } from "@/components/shared/trail-scope";
import { brandOf } from "@/lib/services/brand-of";
import type { BylineEntry } from "@/lib/services/session-contributors";

type CreditBylineProps = {
  entries: BylineEntry[];
  /** Title of the navigation trail the artist links belong to */
  trailTitle: string;
};

const SHOWN = 2;

/**
 * "by Photographer" in a set or session hero — the behind-camera lead roles as a
 * byline next to the channel, the way crew sits in a header (cast keeps the avatars).
 * A resolved artist links to their page; a credit not resolved yet is a dimmed name.
 */
export function CreditByline({ entries, trailTitle }: CreditBylineProps) {
  if (entries.length === 0) return null;
  const shown = entries.slice(0, SHOWN);
  const rest = entries.slice(SHOWN);
  const roles = [...new Set(entries.map((e) => e.roleName))].join(", ");

  return (
    <TrailScope title={trailTitle}>
      <span
        className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-1"
        data-testid="credit-byline"
        title={roles}
      >
        {shown.map((e, i) => (
          <span key={e.artistId ?? `raw:${e.name}`} className="inline-flex min-w-0 max-w-full items-center gap-1.5">
            <span className="shrink-0">{i === 0 ? "by" : "&"}</span>
            {e.artistId ? (
              <Link
                href={`/artists/${e.artistId}`}
                title={e.name}
                className="inline-flex min-w-0 items-center gap-1.5 font-medium text-foreground/80 underline-offset-2 transition-colors hover:text-foreground hover:underline"
                data-testid="credit-byline-artist"
              >
                {e.brand && (
                  <span aria-hidden className="inline-flex shrink-0">
                    <EntityMark brand={brandOf({ name: e.name, ...e.brand })} variant="tile" size="xs" round />
                  </span>
                )}
                <span className="truncate">{e.name}</span>
              </Link>
            ) : (
              <span
                className="min-w-0 truncate text-muted-foreground/60 italic"
                title="Not resolved — resolve it in the credits"
                data-testid="credit-byline-unresolved"
              >
                {e.name}
              </span>
            )}
          </span>
        ))}
        {rest.length > 0 && (
          <span className="text-muted-foreground/70" title={rest.map((e) => e.name).join(", ")}>
            +{rest.length}
          </span>
        )}
      </span>
    </TrailScope>
  );
}
