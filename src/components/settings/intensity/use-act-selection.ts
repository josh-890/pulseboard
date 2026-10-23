"use client";

import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import type { BoardLayout } from "./use-act-board";
import { cellKey } from "./use-act-board";

// The act open in the side panel (K2): `?act=<id>` in the address — a link
// opens it, Back closes it. Set with the History API, so opening a card asks
// nothing of the server. ↑/↓ walk the cards in reading order: down a column,
// level by level, then the next column.

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

function withAct(id: string | null): string {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("act", id);
  else url.searchParams.delete("act");
  return url.pathname + url.search + url.hash;
}

export function useActSelection(
  layout: BoardLayout,
  scenarioIds: string[],
  levels: number[],
  known: Set<string>,
) {
  const params = useSearchParams();
  const raw = params.get("act");
  const selectedId = raw && known.has(raw) ? raw : null;
  // Opened here (pushed): closing goes Back, so the history holds no dead entry
  const pushed = useRef(false);

  const order = useMemo(
    () =>
      scenarioIds.flatMap((s) =>
        levels.flatMap((l) => layout[cellKey(s, l)] ?? []),
      ),
    [layout, scenarioIds, levels],
  );

  const open = useCallback(
    (id: string) => {
      if (selectedId) {
        window.history.replaceState(null, "", withAct(id));
      } else {
        window.history.pushState(null, "", withAct(id));
        pushed.current = true;
      }
    },
    [selectedId],
  );

  const close = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", withAct(null));
    }
  }, []);

  /** The next (+1) or previous (-1) card in reading order, or null at the end */
  const neighbour = useCallback(
    (step: 1 | -1) => {
      if (!selectedId) return null;
      return order[order.indexOf(selectedId) + step] ?? null;
    },
    [order, selectedId],
  );

  return { selectedId, open, close, neighbour };
}
