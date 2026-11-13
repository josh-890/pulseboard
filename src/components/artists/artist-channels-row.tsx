import Link from "next/link";
import { Radio } from "lucide-react";
import { EntityMark } from "@/components/shared/entity-mark";
import type { ArtistChannel } from "@/lib/services/artist-service";

/** The channels an artist worked for, as small wordmark tiles, most sets first */
export function ArtistChannelsRow({ channels }: { channels: ArtistChannel[] }) {
  if (channels.length === 0) return null;
  return (
    <section aria-labelledby="artist-channels-title" className="space-y-3 md:col-span-2">
      <h2 id="artist-channels-title" className="flex items-center gap-2 text-lg font-semibold">
        <Radio size={18} className="text-muted-foreground" aria-hidden="true" />
        Channels worked for
      </h2>
      <ul className="flex flex-wrap gap-2">
        {channels.map((c) => (
          <li key={c.id}>
            <Link
              href={`/channels/${c.id}`}
              data-trail-name={c.brand.name}
              className="flex items-center gap-3 rounded-xl border border-white/15 bg-card/60 px-3 py-2 transition-colors hover:bg-card/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <EntityMark brand={c.brand} variant="wordmark" size="md" className="max-w-[12rem]" />
              <span className="rounded-full bg-muted/60 px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {c.sets} {c.sets === 1 ? "set" : "sets"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
