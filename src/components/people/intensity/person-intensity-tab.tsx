"use client";

import { IntensityCourse } from "./intensity-course";
import { IntensityMatrixView } from "./intensity-matrix-view";
import { IntensityPeakTiles } from "./intensity-peak-tiles";
import type { PersonIntensityData } from "./types";

export type PersonIntensityTabProps = {
  data: PersonIntensityData;
};

// The person's Intensity tab (ADR-0036): peaks overall and per scenario, the
// catalog as they filled it, and the course session by session.
export function PersonIntensityTab({ data }: PersonIntensityTabProps) {
  if (data.summary.sessions.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-white/20 p-6 text-sm text-muted-foreground">
        No intensity recorded yet — open one of their sessions and tick the acts in the Intensity panel beside the photos.
      </p>
    );
  }
  const firsts = data.summary.sessions.reduce((n, s) => n + s.firsts.length, 0);
  return (
    <div className="space-y-6">
      <IntensityPeakTiles data={data} />
      <section className="space-y-2" aria-labelledby="intensity-matrix-title">
        <h3 id="intensity-matrix-title" className="text-sm font-semibold">
          Acts <span className="font-normal text-muted-foreground">— first time and number of sessions</span>
        </h3>
        <IntensityMatrixView data={data} />
      </section>
      <section className="space-y-2" aria-labelledby="intensity-course-title">
        <h3 id="intensity-course-title" className="text-sm font-semibold">
          Course <span className="font-normal text-muted-foreground">— {data.summary.sessions.length} sessions, {firsts} first times ★</span>
        </h3>
        <IntensityCourse data={data} />
      </section>
    </div>
  );
}
