import type { GalleryItem, SessionMergeSet } from "@/lib/types";

// The compare page shows a session's photos set by set (2026-10-20) — the sets
// in the card's order (earliest release first), a photo in two sets under both,
// the rest under "Not in a set". The person filter keeps the photos that show
// that person (ADR-0023: the session cast minus who is hidden on the image).

export type SessionPhotoGroup = {
  key: string;
  set: SessionMergeSet | null;
  photos: GalleryItem[];
};

export function showsPerson(photo: GalleryItem, personId: string): boolean {
  return (photo.sessionCastIds ?? []).includes(personId) && !(photo.hiddenPersonIds ?? []).includes(personId);
}

export function groupPhotosBySet(sets: SessionMergeSet[], photos: GalleryItem[], personId: string | null = null): SessionPhotoGroup[] {
  const shown = personId ? photos.filter((p) => showsPerson(p, personId)) : photos;
  const known = new Set(sets.map((s) => s.id));
  const groups: SessionPhotoGroup[] = sets.map((set) => ({
    key: set.id,
    set,
    photos: shown.filter((p) => p.setLinks?.some((l) => l.setId === set.id)),
  }));
  const loose = shown.filter((p) => !p.setLinks?.some((l) => known.has(l.setId)));
  if (loose.length > 0) groups.push({ key: "none", set: null, photos: loose });
  return groups;
}

/** The photos in the order the page shows them — each once — for the lightbox and the loupe */
export function photosInShownOrder(groups: SessionPhotoGroup[]): GalleryItem[] {
  const seen = new Set<string>();
  return groups.flatMap((g) => g.photos).filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}
