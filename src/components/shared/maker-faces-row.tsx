import Link from "next/link";
import NextImage from "next/image";
import { Users } from "lucide-react";
import { focalStyle, getInitialsFromName } from "@/lib/utils";
import type { MakerFace } from "@/lib/services/maker-showcase-service";

type MakerFacesRowProps = {
  title: string;
  faces: MakerFace[];
  /** Opens the full list (the Models tab), when there are more */
  moreHref?: string;
};

/** The models seen most on a channel, label or artist: round faces with their set count */
export function MakerFacesRow({ title, faces, moreHref }: MakerFacesRowProps) {
  if (faces.length === 0) return null;
  return (
    <section aria-labelledby="faces-title" className="space-y-3 md:col-span-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="faces-title" className="flex items-center gap-2 text-lg font-semibold">
          <Users size={18} className="text-muted-foreground" aria-hidden="true" />
          {title}
        </h2>
        {moreHref && (
          <Link href={moreHref} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            All models
          </Link>
        )}
      </div>
      <ul className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2 scrollbar-none">
        {faces.map((f) => (
          <li key={f.personId} className="w-24 shrink-0 snap-start sm:w-28">
            <Link
              href={`/people/${f.personId}`}
              data-trail-name={f.name}
              className="group flex flex-col items-center gap-1.5 rounded-xl p-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={`${f.name} (${f.icgId}) · ${f.sets} ${f.sets === 1 ? "set" : "sets"}`}
            >
              <span className="relative h-20 w-20 overflow-hidden rounded-full bg-muted/50 shadow-md ring-2 ring-white/15 transition-transform duration-200 motion-safe:group-hover:scale-105 sm:h-24 sm:w-24">
                {f.headshotUrl ? (
                  <NextImage
                    src={f.headshotUrl}
                    alt=""
                    fill
                    unoptimized
                    sizes="96px"
                    className="object-cover"
                    style={focalStyle(f.focalX, f.focalY)}
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
                    {getInitialsFromName(f.name)}
                  </span>
                )}
              </span>
              <span className="w-full truncate text-xs font-medium group-hover:text-primary">{f.name}</span>
              <span className="-mt-1 w-full truncate font-mono text-[10px] text-muted-foreground">{f.icgId}</span>
              <span className="-mt-1 text-[10px] tabular-nums text-muted-foreground">
                {f.sets} {f.sets === 1 ? "set" : "sets"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
