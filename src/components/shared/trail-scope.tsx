"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAppScrollEl } from "@/lib/scroll-container";
import {
  ENTITY_BASE,
  linkName,
  newTrailId,
  parseEntityHref,
  saveTrailEntry,
  withVia,
  type TrailEntityType,
} from "@/lib/browse-trail";
import { usePeek, type PeekType } from "./peek-provider";

type TrailScopeProps = {
  /** What the list is, shown as "← Back to {title}", e.g. "Artist X · Models shot most" */
  title: string;
  children: ReactNode;
  /** Defaults to `contents`, so the wrapper never changes the layout */
  className?: string;
};

const PEEKABLE = new Set<TrailEntityType>(["person", "set"]);

type Hover = { a: HTMLAnchorElement; top: number; left: number; name: string };

/**
 * Makes a list of entity links walkable (2026-11-13). When you open a link to a
 * person, set, channel … inside it, the scope records the list — every link of
 * the same kind in it, in page order — as a trail entry and adds `?via=` to the
 * address. The detail page then offers "← Back to {title}" and prev/next through
 * exactly that list. The links themselves stay plain links (server components
 * welcome); middle-click / Ctrl-click / "open in new tab" carry the trail too.
 *
 * People and sets can also be peeked at (side panel, ← → through the same list)
 * without leaving: Space on a focused link, or the eye that shows on hover.
 */
export function TrailScope({ title, children, className = "contents" }: TrailScopeProps) {
  const router = useRouter();
  const peek = usePeek();
  const rootRef = useRef<HTMLDivElement>(null);
  // The href prepared on pointer-down, used by the click of the same gesture.
  const prepared = useRef(new WeakMap<HTMLAnchorElement, string>());
  const [hover, setHover] = useState<Hover | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function anchorOf(target: EventTarget | null): HTMLAnchorElement | null {
    const root = rootRef.current;
    if (!root || !(target instanceof Element)) return null;
    const a = target.closest("a[href]");
    // Scopes may nest: a link belongs to its innermost scope only.
    return a instanceof HTMLAnchorElement && a.closest("[data-trail-scope]") === root ? a : null;
  }

  /** Every link of that kind in this scope (not in an inner one), page order, once each */
  function collect(type: TrailEntityType): { ids: string[]; names: string[] } {
    const root = rootRef.current;
    const ids: string[] = [];
    const names: string[] = [];
    if (!root) return { ids, names };
    for (const link of Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
      if (link.closest("[data-trail-scope]") !== root) continue;
      const hit = parseEntityHref(link.getAttribute("href"));
      if (!hit || hit.type !== type || ids.includes(hit.id)) continue;
      ids.push(hit.id);
      names.push(linkName(link));
    }
    return { ids, names };
  }

  function saveEntry(type: TrailEntityType, ids: string[], names: string[]): string {
    const id = newTrailId();
    saveTrailEntry({
      id,
      title,
      returnHref: window.location.pathname + window.location.search,
      entityType: type,
      ids,
      names,
      scrollY: getAppScrollEl()?.scrollTop ?? 0,
      parentId: new URLSearchParams(window.location.search).get("via"),
      createdAt: Date.now(),
    });
    return id;
  }

  function target(a: HTMLAnchorElement) {
    const href = a.getAttribute("href");
    const hit = parseEntityHref(href);
    if (!href || !hit) return null;
    // Filters, tabs and "Show more" of the page itself are not a step on the track.
    if (new URL(href, window.location.href).pathname === window.location.pathname) return null;
    return { href, ...hit };
  }

  function prepare(a: HTMLAnchorElement): string | null {
    const t = target(a);
    if (!t) return null;
    const { ids, names } = collect(t.type);
    if (!ids.includes(t.id)) return null;
    return withVia(t.href, saveEntry(t.type, ids, names));
  }

  function openPeek(a: HTMLAnchorElement): boolean {
    const t = target(a);
    if (!peek || !t || !PEEKABLE.has(t.type)) return false;
    const { ids, names } = collect(t.type);
    const index = ids.indexOf(t.id);
    if (index < 0) return false;
    setHover(null);
    peek.openPeek({
      type: t.type as PeekType,
      title,
      ids,
      names,
      index,
      open: (id) => router.push(withVia(`${ENTITY_BASE[t.type]}/${encodeURIComponent(id)}`, saveEntry(t.type, ids, names))),
    });
    return true;
  }

  function onPointerDownCapture(e: React.PointerEvent) {
    const a = anchorOf(e.target);
    if (!a) return;
    const next = prepare(a);
    if (!next) return;
    prepared.current.set(a, next);
    // Middle-click, Ctrl-click and the context menu use the DOM href.
    a.setAttribute("href", next);
  }

  function onClickCapture(e: React.MouseEvent) {
    const a = anchorOf(e.target);
    if (!a) return;
    const next = prepared.current.get(a) ?? prepare(a); // keyboard Enter has no pointer-down
    prepared.current.delete(a);
    if (!next) return;
    a.setAttribute("href", next);
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === "_blank") return;
    e.preventDefault(); // next/link skips a prevented click
    router.push(next);
  }

  function onKeyDownCapture(e: React.KeyboardEvent) {
    if (e.key !== " " || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const a = anchorOf(e.target);
    if (a && a === document.activeElement && openPeek(a)) e.preventDefault(); // not a page scroll
  }

  function cancelHide() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }

  function hideSoon() {
    cancelHide();
    hideTimer.current = setTimeout(() => setHover(null), 150);
  }

  function onPointerOver(e: React.PointerEvent) {
    if (!peek || e.pointerType !== "mouse") return;
    const a = anchorOf(e.target);
    const t = a ? target(a) : null;
    if (!a || !t || !PEEKABLE.has(t.type)) return;
    cancelHide();
    if (hover?.a === a) return;
    const r = a.getBoundingClientRect();
    const small = r.width < 80;
    setHover({
      a,
      top: small ? r.top - 6 : r.top + 6,
      left: small ? r.right - 18 : r.right - 32,
      name: linkName(a),
    });
  }

  function onPointerOut(e: React.PointerEvent) {
    if (!hover) return;
    const to = e.relatedTarget;
    if (to instanceof Node && hover.a.contains(to)) return;
    hideSoon();
  }

  // The eye stays put while the page scrolls under it: hide it instead.
  useEffect(() => {
    if (!hover) return;
    const el = getAppScrollEl();
    const hide = () => setHover(null);
    el?.addEventListener("scroll", hide, { passive: true });
    window.addEventListener("resize", hide);
    return () => {
      el?.removeEventListener("scroll", hide);
      window.removeEventListener("resize", hide);
    };
  }, [hover]);

  useEffect(() => cancelHide, []);

  return (
    <div
      ref={rootRef}
      data-trail-scope=""
      className={cn(className)}
      onPointerDownCapture={onPointerDownCapture}
      onClickCapture={onClickCapture}
      onKeyDownCapture={onKeyDownCapture}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      {children}
      {hover &&
        createPortal(
          <button
            type="button"
            data-testid="peek-button"
            aria-label={`Peek at ${hover.name}`}
            title={`Peek at ${hover.name} (Space)`}
            onPointerEnter={cancelHide}
            onPointerLeave={hideSoon}
            onClick={() => openPeek(hover.a)}
            // Placed over the hovered link; its position is only known at run time.
            style={{ top: hover.top, left: hover.left }}
            className="fixed z-[60] inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/30 bg-background/90 text-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Eye size={13} aria-hidden="true" />
          </button>,
          document.body,
        )}
    </div>
  );
}
