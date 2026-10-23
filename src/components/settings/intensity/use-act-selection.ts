"use client";

import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import type { BoardLayout } from "./use-act-board";
import { cellKey } from "./use-act-board";

// What is open in the side panel (K2; levels and boundaries 2026-10-23): one of
// `?act=<id>`, `?level=<value>`, `?boundary=<id>` in the address — a link opens
// it, Back closes it. Set with the History API, so opening asks nothing of the
// server. ↑/↓ walk their own kind: cards in reading order (down a column,
// level by level, then the next column); levels and boundaries down the scale.

const WIDE = "(min-width: 1024px)";

function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Room for the panel beside the board; narrower, it slides over as a sheet */
export function useWideScreen(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

export type CatalogSelection =
  | { kind: "act"; key: string }
  | { kind: "level"; key: string }
  | { kind: "boundary"; key: string };

const KINDS = ["act", "level", "boundary"] as const;

function withSelection(sel: CatalogSelection | null): string {
  const url = new URL(window.location.href);
  for (const k of KINDS) url.searchParams.delete(k);
  if (sel) url.searchParams.set(sel.kind, sel.key);
  return url.pathname + url.search + url.hash;
}

const same = (a: CatalogSelection | null, b: CatalogSelection | null) =>
  a?.kind === b?.kind && a?.key === b?.key;

export function useActSelection(
  layout: BoardLayout,
  scenarioIds: string[],
  levels: number[],
  known: { acts: Set<string>; boundaries: Set<string> },
  /** The scale from the top: each boundary before the level it is crossed into */
  scale: CatalogSelection[],
) {
  const params = useSearchParams();
  const act = params.get("act");
  const level = params.get("level");
  const boundary = params.get("boundary");
  const selected = useMemo<CatalogSelection | null>(
    () =>
      act && known.acts.has(act)
        ? { kind: "act", key: act }
        : level !== null && levels.includes(Number(level))
          ? { kind: "level", key: String(Number(level)) }
          : boundary && known.boundaries.has(boundary)
            ? { kind: "boundary", key: boundary }
            : null,
    [act, level, boundary, known, levels],
  );
  // Opened here (pushed): closing goes Back, so the history holds no dead entry
  const pushed = useRef(false);

  const cards = useMemo(
    () =>
      scenarioIds.flatMap((s) =>
        levels.flatMap((l) => layout[cellKey(s, l)] ?? []),
      ),
    [layout, scenarioIds, levels],
  );

  const select = useCallback(
    (sel: CatalogSelection) => {
      if (selected) {
        window.history.replaceState(null, "", withSelection(sel));
      } else {
        window.history.pushState(null, "", withSelection(sel));
        pushed.current = true;
      }
    },
    [selected],
  );

  const close = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", withSelection(null));
    }
  }, []);

  /** The next (+1) or previous (-1) of the open kind — card, or level/boundary — or null at the end */
  const neighbour = useCallback(
    (step: 1 | -1): CatalogSelection | null => {
      if (!selected) return null;
      if (selected.kind === "act") {
        const id = cards[cards.indexOf(selected.key) + step];
        return id ? { kind: "act", key: id } : null;
      }
      const i = scale.findIndex((s) => same(s, selected));
      return scale[i + step] ?? null;
    },
    [cards, scale, selected],
  );

  return {
    selected,
    /** The open card's id, for the board */
    selectedId: selected?.kind === "act" ? selected.key : null,
    /** Opens a card (the board's click and Enter) */
    open: (id: string) => select({ kind: "act", key: id }),
    select,
    close,
    neighbour,
  };
}
