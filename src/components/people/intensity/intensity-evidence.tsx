"use client";

import Link from "next/link";
import { formatIntensity } from "@/lib/intensity";
import { serializeTagQuery } from "@/lib/tag-query";
import { focalStyle } from "@/lib/utils";
import type { PersonIntensityData } from "./types";

export type IntensityEvidenceProps = {
  data: PersonIntensityData;
};

const SHOWN = 8;

/** The session gallery, filtered to the photos that are evidence for this act */
function actHref(sessionId: string, scenario: string, act: string) {
  const tags = serializeTagQuery({ all: [], none: [], predicates: [{ key: "act", op: ":", value: `${scenario}/${act}` }] });
  return `/sessions/${sessionId}?tags=${encodeURIComponent(tags)}`;
}

// Each act in pictures (ADR-0036, 3b): the photos linked to it as evidence,
// oldest session first. A photo opens its session's gallery filtered to the act.
export function IntensityEvidence({ data }: IntensityEvidenceProps) {
  const rows = data.scenarios.flatMap((sc) =>
    sc.acts
      .filter((a) => (data.evidence[a.id]?.length ?? 0) > 0)
      .map((a) => ({ scenario: sc.name, act: a, photos: data.evidence[a.id]! })),
  );
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No photos linked yet — in a session, select photos and choose “Act…”, or press A in the viewer.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map(({ scenario, act, photos }) => (
        <li key={act.id} className="space-y-1.5" aria-label={`${act.name} in pictures`}>
          <p className="flex items-baseline gap-2 text-sm">
            <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums">{formatIntensity(act.level)}</span>
            <span className="font-medium">{act.name}</span>
            <span className="text-xs text-muted-foreground">
              {scenario} · {photos.length} photo{photos.length === 1 ? "" : "s"}
            </span>
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 pl-10">
            {photos.slice(0, SHOWN).map((p) => (
              <Link
                key={p.id}
                href={actHref(p.sessionId, scenario, act.name)}
                className="block h-24 w-20 shrink-0 overflow-hidden rounded-lg border border-white/15 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Open the session's photos of ${act.name}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- MinIO variants, sized by the box */}
                <img src={p.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" style={focalStyle(p.focalX, p.focalY)} />
              </Link>
            ))}
            {photos.length > SHOWN && (
              <Link
                href={actHref(photos[SHOWN]!.sessionId, scenario, act.name)}
                className="flex h-24 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/20 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              >
                +{photos.length - SHOWN}
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
