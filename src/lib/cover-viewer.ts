/**
 * The hero's cover opens in the viewer (2026-11-19). The hero only knows the
 * file; the viewers live in the gallery (photos) and the cover slot (cover art),
 * so it asks them with a window event. A listener that can show the file calls
 * `preventDefault()` — that is how the hero knows the photo viewer took it, and
 * falls back to the cover-art viewer otherwise (a photo filtered out of the grid,
 * cover art let in with the photos …).
 */
export const OPEN_COVER_PHOTO = "pulse:open-cover-photo";
export const OPEN_COVER_ART = "pulse:open-cover-art";

export type OpenCoverDetail = { mediaItemId: string };

/** Ask a viewer to show this file; true when one did */
export function requestCover(kind: typeof OPEN_COVER_PHOTO | typeof OPEN_COVER_ART, mediaItemId: string): boolean {
  const e = new CustomEvent<OpenCoverDetail>(kind, { detail: { mediaItemId }, cancelable: true });
  return !window.dispatchEvent(e);
}

/** Open the cover: a photo in the gallery's viewer, otherwise in the cover-art viewer */
export function openCover(mediaItemId: string, isPhoto: boolean): boolean {
  if (isPhoto && requestCover(OPEN_COVER_PHOTO, mediaItemId)) return true;
  return requestCover(OPEN_COVER_ART, mediaItemId) || (!isPhoto && requestCover(OPEN_COVER_PHOTO, mediaItemId));
}
