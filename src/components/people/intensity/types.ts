import type { PersonIntensity } from "@/lib/intensity-person";
import type { PersonActEvidence } from "@/lib/services/intensity-service";

/** What the person page needs for the Intensity gauge and tab (ADR-0036) */
export type PersonIntensityData = {
  summary: PersonIntensity;
  scale: { value: number; title: string | null; description: string | null }[];
  scenarios: { id: string; name: string; acts: { id: string; name: string; description: string | null; level: number }[] }[];
  /** Act id → the photos that show it (slice 3b) */
  evidence: PersonActEvidence;
};
