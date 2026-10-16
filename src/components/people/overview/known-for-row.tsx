import Link from "next/link";
import NextImage from "next/image";
import { Camera, Clapperboard, Film, Star } from "lucide-react";
import { focalStyle } from "@/lib/utils";
import type { KnownForSet } from "@/lib/services/person-showcase-service";

// "Known for" (2026-10-16): the person's sets as posters — your highest-rated
// first, then the newest. Each opens the set.

export type KnownForRowProps = {
  sets: KnownForSet[];
};

export function KnownForRow({ sets }: KnownForRowProps) {
  if (sets.length === 0) return null;
  return (
    <section aria-labelledby="known-for-title" className="space-y-3 md:col-span-2">
      <h2 id="known-for-title" className="flex items-center gap-2 text-lg font-semibold">
        <Clapperboard size={18} className="text-muted-foreground" aria-hidden="true" />
        Known for
      </h2>
      <ul className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 scrollbar-none">
        {sets.map((s) => (
          <li key={s.id} className="w-36 shrink-0 snap-start sm:w-40">
            <Link
              href={`/sets/${s.id}`}
              className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted/40 shadow-md ring-1 ring-white/10 transition-shadow duration-200 group-hover:shadow-xl">
                {s.coverUrl ? (
                  <NextImage
                    src={s.coverUrl}
                    alt=""
                    fill
                    unoptimized
                    sizes="160px"
                    className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.04]"
                    style={focalStyle(s.coverFocalX, s.coverFocalY)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                    {s.isVideo ? <Film size={24} /> : <Camera size={24} />}
                  </div>
                )}
                {s.isVideo && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white" aria-label="Video">
                    <Film size={11} />
                  </span>
                )}
                {s.rating !== null && (
                  <span className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                    <Star size={10} className="fill-current" aria-hidden="true" />
                    {s.rating}
                    <span className="sr-only"> of 5</span>
                  </span>
                )}
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">{s.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[s.year, s.channelName].filter(Boolean).join(" · ") || "Undated"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
