"use client";

import { useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { getAppScrollEl } from "@/lib/scroll-container";
import {
  linkName,
  newTrailId,
  parseEntityHref,
  saveTrailEntry,
  withVia,
  type TrailEntityType,
} from "@/lib/browse-trail";

type TrailScopeProps = {
  /** What the list is, shown as "← Back to {title}", e.g. "Artist X · Models shot most" */
  title: string;
  children: ReactNode;
  /** Defaults to `contents`, so the wrapper never changes the layout */
  className?: string;
};

/**
 * Makes a list of entity links walkable (2026-11-13). When you open a link to a
 * person, set, channel … inside it, the scope records the list — every link of
 * the same kind in it, in page order — as a trail entry and adds `?via=` to the
 * address. The detail page then offers "← Back to {title}" and prev/next through
 * exactly that list. The links themselves stay plain links (server components
 * welcome); middle-click / Ctrl-click / "open in new tab" carry the trail too.
 */
export function TrailScope({ title, children, className = "contents" }: TrailScopeProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  // The href prepared on pointer-down, used by the click of the same gesture.
  const prepared = useRef(new WeakMap<HTMLAnchorElement, string>());

  function anchorOf(target: EventTarget | null): HTMLAnchorElement | null {
    const root = rootRef.current;
    if (!root || !(target instanceof Element)) return null;
    const a = target.closest("a[href]");
    // Scopes may nest: a link belongs to its innermost scope only.
    return a instanceof HTMLAnchorElement && a.closest("[data-trail-scope]") === root ? a : null;
  }

  function prepare(a: HTMLAnchorElement): string | null {
    const root = rootRef.current;
    const href = a.getAttribute("href");
    const target = parseEntityHref(href);
    if (!root || !href || !target) return null;
    // Filters, tabs and "Show more" of the page itself are not a step on the track.
    if (new URL(href, window.location.href).pathname === window.location.pathname) return null;

    const ids: string[] = [];
    const names: string[] = [];
    for (const link of Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
      if (link.closest("[data-trail-scope]") !== root) continue; // an inner scope's own list
      const hit = parseEntityHref(link.getAttribute("href"));
      if (!hit || hit.type !== target.type || ids.includes(hit.id)) continue;
      ids.push(hit.id);
      names.push(linkName(link));
    }
    if (!ids.includes(target.id)) return null;

    const here = new URLSearchParams(window.location.search);
    const id = newTrailId();
    saveTrailEntry({
      id,
      title,
      returnHref: window.location.pathname + window.location.search,
      entityType: target.type as TrailEntityType,
      ids,
      names,
      scrollY: getAppScrollEl()?.scrollTop ?? 0,
      parentId: here.get("via"),
      createdAt: Date.now(),
    });
    return withVia(href, id);
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

  return (
    <div
      ref={rootRef}
      data-trail-scope=""
      className={cn(className)}
      onPointerDownCapture={onPointerDownCapture}
      onClickCapture={onClickCapture}
    >
      {children}
    </div>
  );
}
