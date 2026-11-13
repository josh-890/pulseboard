"use client";

import { useEffect } from "react";
import { RECENT_EVENT, recordRecent } from "@/lib/recently-viewed";
import type { TrailEntityType } from "@/lib/browse-trail";

type RecordRecentProps = {
  type: TrailEntityType;
  id: string;
  /** People as `Name (ICG-ID)` */
  name: string;
};

/** Puts this detail page on the Recent list when it opens (renders nothing) */
export function RecordRecent({ type, id, name }: RecordRecentProps) {
  useEffect(() => {
    recordRecent({ type, id, name });
    window.dispatchEvent(new Event(RECENT_EVENT));
  }, [type, id, name]);
  return null;
}
