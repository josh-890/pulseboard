import type { ActExtraOverride } from "@/lib/intensity";
import type { SessionIntensity } from "@/lib/services/intensity-service";
import type { SessionIntensityCatalog } from "@/components/sessions/intensity/types";

// Intensity where a photo is in hand (2026-11-28): the viewer and a gallery
// selection tick an act and link the photo in one step. This is what they
// know — plain data, built on the server from the session intensity the page
// already loads, so a server page can import it.

/** A lead in a session — the people an act can be recorded for */
export type PhotoLead = {
  contributionId: string;
  personId: string;
  /** `Name (ICG-ID)` */
  label: string;
  sexAtBirth: string | null;
  /** The acts ticked for them here, with their departures from the session extras */
  acts: { actId: string; overrides: ActExtraOverride[] }[];
  /** Their session extras — every act inherits them */
  extraIds: string[];
};

export type PhotoIntensityData = {
  catalog: SessionIntensityCatalog;
  /** Session id → its leads */
  sessions: Record<string, PhotoLead[]>;
  /** Photo id → `contributionId:actId` of the acts it is evidence for */
  evidence: Record<string, string[]>;
};

/** The key of one act of one lead */
export const actKey = (contributionId: string, actId: string) => `${contributionId}:${actId}`;

export function buildPhotoIntensity(
  catalog: SessionIntensityCatalog,
  sessions: { id: string; contributions: SessionIntensity }[],
): PhotoIntensityData {
  const evidence: Record<string, string[]> = {};
  const bySession: Record<string, PhotoLead[]> = {};
  for (const s of sessions) {
    bySession[s.id] = s.contributions.map((c) => {
      for (const a of c.acts) for (const m of a.mediaIds) (evidence[m] ??= []).push(actKey(c.id, a.actId));
      return {
        contributionId: c.id,
        personId: c.person.id,
        label: `${c.person.name} (${c.person.icgId})`,
        sexAtBirth: c.person.sexAtBirth,
        acts: c.acts.map((a) => ({ actId: a.actId, overrides: a.overrides })),
        extraIds: c.extraIds,
      };
    });
  }
  return { catalog, sessions: bySession, evidence };
}
