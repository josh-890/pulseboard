import type { PersonIntensity } from "@/lib/intensity-person";

/** What the person page needs for the Intensity gauge and tab (ADR-0036) */
export type PersonIntensityData = {
  summary: PersonIntensity;
  scale: { value: number; title: string | null; description: string | null }[];
  scenarios: { id: string; name: string; acts: { id: string; name: string; description: string | null; level: number }[] }[];
};
