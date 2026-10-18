"use client";

import Link from "next/link";
import { ArrowUpRight, CornerUpLeft } from "lucide-react";
import { setPhotoHref } from "@/lib/media-origin-href";
import type { MediaItemOrigin } from "@/lib/types";

// The info panel's "Origin" (2026-10-18): every set the photo is in (each opens
// on the photo), the people shown in it and its session — the way back to the
// model behind a favorite or a collection entry.

export type LightboxOriginSectionProps = {
  origin: MediaItemOrigin | null | undefined;
};

const CHIP =
  "inline-flex max-w-full items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/15 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60";

export function LightboxOriginSection({ origin }: LightboxOriginSectionProps) {
  if (origin === undefined) {
    return <div aria-hidden="true" className="mb-2 h-14 animate-pulse rounded-md bg-white/5 motion-reduce:animate-none" />;
  }
  if (origin === null) {
    return <p className="pb-2 text-xs italic text-white/50">Could not tell where this photo comes from.</p>;
  }

  return (
    <div className="space-y-2 pb-2 text-xs">
      <div>
        <div className="mb-1 text-white/50">{origin.sets.length === 1 ? "Set" : "Sets"}</div>
        {origin.sets.length === 0 ? (
          <p className="italic text-white/50">In no set.</p>
        ) : (
          <ul className="flex flex-col items-start gap-1">
            {origin.sets.map((s) => (
              <li key={s.id} className="max-w-full">
                <Link href={setPhotoHref(s.id, origin.imageId)} className={CHIP}>
                  <CornerUpLeft size={11} aria-hidden="true" className="shrink-0 opacity-70" />
                  <span className="truncate font-medium">{s.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(origin.people.length > 0 || origin.referencePerson) && (
        <div>
          <div className="mb-1 text-white/50">{origin.referencePerson ? "Reference of" : "In this photo"}</div>
          <ul className="flex flex-wrap gap-1">
            {(origin.referencePerson ? [origin.referencePerson] : origin.people).map((p) => (
              <li key={p.id} className="max-w-full">
                <Link href={`/people/${p.id}`} className={CHIP}>
                  <span className="truncate">{p.name}</span>
                  <ArrowUpRight size={11} aria-hidden="true" className="shrink-0 opacity-70" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="mb-1 text-white/50">Session</div>
        <Link href={`/sessions/${origin.session.id}`} className={CHIP}>
          <span className="truncate">{origin.session.name}</span>
          <ArrowUpRight size={11} aria-hidden="true" className="shrink-0 opacity-70" />
        </Link>
      </div>
    </div>
  );
}
