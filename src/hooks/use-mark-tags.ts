"use client";

import { useEffect, useState } from "react";
import { getMarkTagsAction } from "@/lib/actions/tag-actions";
import type { MarkTags } from "@/lib/services/media-mark-service";

// The `iconic` and `outtake` tags behind the photo marks (2026-10-16). Every tile,
// lightbox and bulk bar on the page shares one copy, loaded once.

let store: MarkTags | null = null;
let inflight: Promise<MarkTags | null> | null = null;
const listeners = new Set<(tags: MarkTags) => void>();

function load(): Promise<MarkTags | null> {
  if (!inflight) {
    inflight = getMarkTagsAction()
      .then((tags) => {
        store = tags;
        listeners.forEach((l) => l(tags));
        return tags;
      })
      .catch(() => {
        inflight = null; // let a later mount try again
        return null;
      });
  }
  return inflight;
}

/** The mark tags, or null until loaded (the marks then show ★ only) */
export function useMarkTags(): MarkTags | null {
  const [tags, setTags] = useState<MarkTags | null>(store);
  useEffect(() => {
    listeners.add(setTags);
    if (store === null) void load();
    return () => {
      listeners.delete(setTags);
    };
  }, []);
  return tags;
}
