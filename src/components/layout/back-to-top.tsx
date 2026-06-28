"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAppScrollEl } from "@/lib/scroll-container";

const SHOW_THRESHOLD = 600;

/**
 * Floating "back to top" button. Watches the shared `#app-scroll` content
 * region (not the window) and fades in once scrolled past the threshold.
 * Works on both list and detail pages since they share one scroll
 * container. Respects prefers-reduced-motion for the scroll itself.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = getAppScrollEl();
    if (!el) return;

    const onScroll = () => setVisible(el.scrollTop > SHOW_THRESHOLD);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  function handleClick() {
    const el = getAppScrollEl();
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Back to top"
      tabIndex={visible ? 0 : -1}
      className={cn(
        "absolute bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full",
        "border border-white/20 bg-card/80 text-foreground shadow-lg backdrop-blur-md",
        "transition-all duration-200 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        visible ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <ArrowUp size={20} />
    </button>
  );
}
