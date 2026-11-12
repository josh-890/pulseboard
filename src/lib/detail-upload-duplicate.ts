import type { DetailUse } from "@/lib/services/detail-use-service";

// Uploading a file into a person's detail category when the upload route says
// it's a duplicate (2026-11-12). The callers used to re-send with
// duplicateAction=accept at once and so made a second copy without a word. Now:
//   - already in this category → "already" (warn; the caller may add it anyway)
//   - in the reference session without a category → "link" that item instead
//   - otherwise (another category, or only elsewhere) → "upload" as before
// Client-safe: only fetch.

export type DetailUploadDecision =
  | { kind: "already"; count: number; mediaItemId: string }
  | { kind: "link"; mediaItemId: string }
  | { kind: "upload" };

export async function decideDetailUploadDuplicate(
  matches: { mediaItemId: string }[],
  personId: string,
  categoryId: string,
): Promise<DetailUploadDecision> {
  const first = matches[0];
  if (!first) return { kind: "upload" };
  try {
    const res = await fetch(`/api/media/${first.mediaItemId}/detail-uses?personId=${encodeURIComponent(personId)}`);
    if (!res.ok) return { kind: "upload" };
    const copies = ((await res.json()) as DetailUse[]).filter((u) => u.kind === "copy");
    const here = copies.filter((u) => u.categoryId === categoryId);
    if (here.length > 0) return { kind: "already", count: here.length, mediaItemId: here[0].mediaItemId };
    const unlinked = copies.find((u) => u.categoryId === null);
    if (unlinked) return { kind: "link", mediaItemId: unlinked.mediaItemId };
  } catch {
    // The check is a courtesy — fall back to the old behaviour.
  }
  return { kind: "upload" };
}
