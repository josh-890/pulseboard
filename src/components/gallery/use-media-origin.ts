"use client";

import { useEffect, useState } from "react";
import type { MediaItemOrigin } from "@/lib/types";

/**
 * Where the photo on screen comes from, asked once per photo and remembered
 * while the viewer is open. undefined = still asking (or not enabled),
 * null = could not tell.
 */
export function useMediaOrigin(mediaItemId: string | undefined, enabled: boolean): MediaItemOrigin | null | undefined {
  const [origins, setOrigins] = useState<Record<string, MediaItemOrigin | null>>({});
  const known = mediaItemId ? mediaItemId in origins : true;

  useEffect(() => {
    if (!enabled || !mediaItemId || known) return;
    let cancelled = false;
    fetch(`/api/media/${mediaItemId}/origin`)
      .then((r) => (r.ok ? (r.json() as Promise<MediaItemOrigin>) : null))
      .catch(() => null)
      .then((origin) => {
        if (!cancelled) setOrigins((prev) => ({ ...prev, [mediaItemId]: origin }));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, mediaItemId, known]);

  return enabled && mediaItemId ? origins[mediaItemId] : undefined;
}
