import type { PickerExtra, PickerGroup } from "@/components/intensity/intensity-extras-picker";

/** The catalog as a session needs it: scenarios with their acts (lowest first), extras and groups */
export type SessionIntensityCatalog = {
  scenarios: { id: string; name: string; acts: { id: string; name: string; description: string | null; level: number }[] }[];
  groups: PickerGroup[];
  extras: PickerExtra[];
  /** The top of the tenant's scale */
  max: number;
};

/** Remembers whether the intensity panel is open — read by the page, so it renders as left */
export const INTENSITY_PANEL_COOKIE = "pulseboard-intensity-panel";
