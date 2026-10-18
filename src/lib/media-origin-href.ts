import type { MediaItemOrigin } from "@/lib/types";

/**
 * Where "back to the source" leads for an image: into its first set, opened on
 * the image itself; without a set, to the person a reference session belongs
 * to; otherwise to its session.
 */
export function mediaOriginTarget(origin: MediaItemOrigin): { href: string; label: string; kind: "set" | "person" | "session" } {
  const set = origin.sets[0];
  if (set) return { href: setPhotoHref(set.id, origin.imageId), label: set.title, kind: "set" };
  if (origin.referencePerson) {
    return { href: `/people/${origin.referencePerson.id}`, label: origin.referencePerson.name, kind: "person" };
  }
  return { href: `/sessions/${origin.session.id}`, label: origin.session.name, kind: "session" };
}

/** A set page opened on one of its photos (`?photo=` opens the viewer there) */
export function setPhotoHref(setId: string, mediaItemId: string): string {
  return `/sets/${setId}?photo=${encodeURIComponent(mediaItemId)}`;
}
