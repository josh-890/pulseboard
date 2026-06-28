/**
 * The app-shell content region (`<main id="app-scroll">`) is the scroll
 * container for all page content — the window itself does not scroll. Use
 * this accessor instead of `window.scrollY` / `window.scrollTo` for scroll
 * save/restore and programmatic scrolling.
 */
export const APP_SCROLL_ID = "app-scroll";

export function getAppScrollEl(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(APP_SCROLL_ID);
}
