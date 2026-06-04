"use client";

import { useSyncExternalStore } from "react";

// Subscribe to a CSS media query. Returns whether the query currently
// matches. Built on useSyncExternalStore so React handles the
// subscription lifecycle and avoids the "setState in effect" anti-pattern.
//
// During SSR (no `window`), `useSyncExternalStore` calls the getServerSnapshot
// callback which we hard-code to `false` — the first client render then
// reconciles against the real matchMedia value without a layout flash.

function subscribe(query: string) {
  return (callback: () => void) => {
    if (typeof window === "undefined") return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener("change", callback);
    return () => mql.removeEventListener("change", callback);
  };
}

function getSnapshot(query: string) {
  return () => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  };
}

function getServerSnapshot() {
  return false;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(subscribe(query), getSnapshot(query), getServerSnapshot);
}
