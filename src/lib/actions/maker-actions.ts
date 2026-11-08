"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { getMakerShowcase, type MakerKind } from "@/lib/services/maker-showcase-service";
import type { PersonShowcase, ShowcaseMode } from "@/lib/services/person-showcase-service";

const KINDS: MakerKind[] = ["channel", "label", "artist"];

/** A channel's, label's or artist's showcase: Best, or a fresh Random deal per seed (Shuffle) */
export async function getMakerShowcaseAction(
  kind: MakerKind,
  id: string,
  mode: ShowcaseMode,
  seed?: string,
): Promise<PersonShowcase> {
  if (!KINDS.includes(kind)) throw new Error("Unknown kind");
  return withTenantFromHeaders(() => getMakerShowcase({ kind, id }, { mode, seed }));
}
