"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getAppScrollEl } from "@/lib/scroll-container";
import { takePendingScroll } from "@/lib/browse-trail";

/**
 * Back on a list page via the trail ("← Back to …", a crumb, Esc), scroll the
 * content region to where you left it (2026-11-13). The page may still be
 * growing (images, streamed sections), so it retries for a moment until the
 * offset fits.
 */
export function TrailScrollRestore() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    const href = pathname + (search ? `?${search}` : "");
    const y = takePendingScroll(href);
    if (y === null || y <= 0) return;
    let tries = 0;
    let frame = 0;
    const step = () => {
      const el = getAppScrollEl();
      if (!el) return;
      if (el.scrollHeight - el.clientHeight >= y || tries > 60) {
        el.scrollTop = y;
        return;
      }
      tries++;
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, search]);

  return null;
}
