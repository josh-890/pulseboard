"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  type Announcements,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { moveIntensityActsAction } from "@/lib/actions/intensity-catalog-actions";
import { formatIntensity } from "@/lib/intensity";
import type { IntensityCatalog } from "@/lib/services/intensity-catalog-service";

// The catalog as a board (2026-10-23, K1): columns are scenarios, lanes are
// levels, cards are acts. A card dragged into any cell takes that scenario and
// level, at the place it is dropped; the move is optimistic, then saved, with
// Undo in the toast. Cells are keyed `scenarioId|level`.

type Act = IntensityCatalog["scenarios"][number]["acts"][number];
export type BoardLayout = Record<string, string[]>;

export const cellKey = (scenarioId: string, level: number) =>
  `${scenarioId}|${level}`;
const CELL_PREFIX = "cell:";
export const cellDroppableId = (scenarioId: string, level: number) =>
  `${CELL_PREFIX}${cellKey(scenarioId, level)}`;

function parseCell(key: string): { scenarioId: string; level: number } {
  const i = key.lastIndexOf("|");
  return { scenarioId: key.slice(0, i), level: Number(key.slice(i + 1)) };
}

function layoutOf(catalog: IntensityCatalog): BoardLayout {
  const layout: BoardLayout = {};
  for (const s of catalog.scenarios) {
    for (const a of s.acts) (layout[cellKey(s.id, a.level)] ??= []).push(a.id);
  }
  return layout;
}

function cellOf(layout: BoardLayout, actId: string): string | null {
  for (const [key, ids] of Object.entries(layout))
    if (ids.includes(actId)) return key;
  return null;
}

/** The card or cell under the pointer wins; between cells, the one nearest the pointer */
const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length) return within;
  const p = args.pointerCoordinates;
  if (!p) return closestCenter(args); // the keyboard: the nearest card or cell
  let best: { id: string | number; d: number } | null = null;
  for (const c of args.droppableContainers) {
    if (!String(c.id).startsWith(CELL_PREFIX)) continue;
    const r = args.droppableRects.get(c.id);
    if (!r) continue;
    const dx = Math.max(r.left - p.x, 0, p.x - (r.left + r.width));
    const dy = Math.max(r.top - p.y, 0, p.y - (r.top + r.height));
    const d = Math.hypot(dx, dy);
    if (!best || d < best.d) best = { id: c.id, d };
  }
  return best && best.d < 48 ? [{ id: best.id, data: { value: best.d } }] : [];
};

/** When the last drag ended — the click that ends a drag opens no editor */
let dragEndedAt = 0;
function markDragEnded() {
  dragEndedAt = Date.now();
}
export const swallowClickAfterDrag = (e: {
  stopPropagation: () => void;
  preventDefault: () => void;
}) => {
  if (Date.now() - dragEndedAt > 100) return;
  e.stopPropagation();
  e.preventDefault();
};

/** Where a held card would land: a cell, before an act there or at its end */
export type DropTarget = { cell: string; beforeId: string | null };

export function useActBoard(catalog: IntensityCatalog) {
  const router = useRouter();
  const saved = useMemo(() => layoutOf(catalog), [catalog]);
  const acts = useMemo(() => {
    const m = new Map<string, Act>();
    for (const s of catalog.scenarios) for (const a of s.acts) m.set(a.id, a);
    return m;
  }, [catalog]);
  const scenarioNames = useMemo(
    () => new Map(catalog.scenarios.map((s) => [s.id, s.name])),
    [catalog],
  );

  // After a drop, the board as moved — until the saved catalog comes back
  const [moved, setMoved] = useState<{
    layout: BoardLayout;
    basis: IntensityCatalog;
  } | null>(null);
  if (moved && moved.basis !== catalog) setMoved(null);
  const layout = moved?.layout ?? saved;

  const [activeId, setActiveId] = useState<string | null>(null);
  // Another cell under the card: lit, with a line where it would land. Within
  // its own cell the cards make room instead, so nothing jumps under the pointer.
  const [target, setTarget] = useState<DropTarget | null>(null);
  // The lane under the held card — its own cell included — lit across the board
  const [overLevel, setOverLevel] = useState<number | null>(null);
  const targetRef = useRef<DropTarget | null>(null);
  const aim = (t: DropTarget | null) => {
    targetRef.current = t;
    setTarget(t);
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // A finger holds a moment first, so the board still scrolls
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 6 },
    }),
    // Space picks a card up; Enter is left to open its panel
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: ["Space"],
        cancel: ["Escape"],
        end: ["Space", "Enter"],
      },
    }),
  );

  function targetFor(activeIdNow: string, overId: string): DropTarget | null {
    const home = cellOf(layout, activeIdNow);
    if (overId.startsWith(CELL_PREFIX)) {
      const cell = overId.slice(CELL_PREFIX.length);
      // Its own cell, off the cards: stays where it is
      return cell === home ? null : { cell, beforeId: null };
    }
    if (overId === activeIdNow) return null;
    const cell = cellOf(layout, overId);
    if (!cell) return null;
    if (cell !== home) return { cell, beforeId: overId };
    // Same cell: where the sortable preview puts it
    const ids = layout[cell]!;
    const order = arrayMove(ids, ids.indexOf(activeIdNow), ids.indexOf(overId));
    return { cell, beforeId: order[order.indexOf(activeIdNow) + 1] ?? null };
  }

  // A mouse or finger drag: the card in hand follows the pointer itself
  const [follow, setFollow] = useState<{
    start: { x: number; y: number };
    grip: { x: number; y: number };
    width: number;
  } | null>(null);

  function onDragStart({ active, activatorEvent }: DragStartEvent) {
    const id = String(active.id);
    const at =
      activatorEvent instanceof KeyboardEvent
        ? null
        : getEventCoordinates(activatorEvent);
    // The card as it was pressed — dnd-kit's own rect is not measured yet at this point
    const pressed =
      activatorEvent.target instanceof Element
        ? activatorEvent.target.closest("li")
        : null;
    const rect =
      pressed?.getBoundingClientRect() ?? active.rect.current.initial;
    setFollow(
      at && rect
        ? {
            start: at,
            grip: { x: at.x - rect.left, y: at.y - rect.top },
            width: rect.width,
          }
        : null,
    );
    setActiveId(id);
    aim(null);
    const home = cellOf(layout, id);
    setOverLevel(home ? parseCell(home).level : null);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return; // between cells: keep the last aim
    const overId = String(over.id);
    aim(targetFor(String(active.id), overId));
    const cell = overId.startsWith(CELL_PREFIX)
      ? overId.slice(CELL_PREFIX.length)
      : cellOf(layout, overId);
    if (cell) setOverLevel(parseCell(cell).level);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const id = String(active.id);
    markDragEnded();
    setActiveId(null);
    setOverLevel(null);
    setFollow(null);
    const t = over ? targetFor(id, String(over.id)) : targetRef.current;
    aim(null);
    const home = cellOf(layout, id);
    if (!t || !home) return;
    const homeIds = layout[home]!;
    if (
      t.cell === home &&
      t.beforeId === (homeIds[homeIds.indexOf(id) + 1] ?? null)
    )
      return;

    const back: DropTarget = {
      cell: home,
      beforeId: homeIds[homeIds.indexOf(id) + 1] ?? null,
    };
    const next = { ...layout, [home]: homeIds.filter((x) => x !== id) };
    const into = next[t.cell] ?? [];
    const at = t.beforeId ? into.indexOf(t.beforeId) : -1;
    next[t.cell] =
      at < 0 ? [...into, id] : [...into.slice(0, at), id, ...into.slice(at)];
    setMoved({ layout: next, basis: catalog });
    void save(id, t, back);
  }

  function onDragCancel() {
    setActiveId(null);
    setOverLevel(null);
    setFollow(null);
    aim(null);
  }

  async function save(id: string, to: DropTarget, back: DropTarget) {
    const place = parseCell(to.cell);
    const result = await moveIntensityActsAction([id], {
      ...place,
      beforeId: to.beforeId,
    });
    if (!result.success) {
      setMoved(null);
      toast.error(result.error ?? "Could not move the act");
      return;
    }
    router.refresh();
    const name = acts.get(id)?.name ?? "Act";
    const message =
      to.cell === back.cell
        ? `${name}: new place in its row`
        : `${name} → ${scenarioNames.get(place.scenarioId) ?? "?"} · ${formatIntensity(place.level)}`;
    toast(message, {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: async () => {
          const r = await moveIntensityActsAction([id], {
            ...parseCell(back.cell),
            beforeId: back.beforeId,
          });
          if (!r.success) toast.error(r.error ?? "Could not undo");
          router.refresh();
        },
      },
    });
  }

  const place = (id: string | number | undefined) => {
    if (id === undefined) return "nowhere";
    const key = String(id).startsWith(CELL_PREFIX)
      ? String(id).slice(CELL_PREFIX.length)
      : cellOf(layout, String(id));
    if (!key) return "nowhere";
    const { scenarioId, level } = parseCell(key);
    return `${scenarioNames.get(scenarioId) ?? "?"} at ${formatIntensity(level)}`;
  };
  const nameOf = (id: string | number) =>
    acts.get(String(id))?.name ?? "the act";
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${nameOf(active.id)}, in ${place(active.id)}.`,
    onDragOver: ({ active, over }) =>
      `${nameOf(active.id)} over ${place(over?.id)}.`,
    onDragEnd: ({ active, over }) =>
      `${nameOf(active.id)} dropped in ${place(over?.id)}.`,
    onDragCancel: ({ active }) => `${nameOf(active.id)} stays where it was.`,
  };

  return {
    layout,
    acts,
    /** Mouse or finger: the card in hand, drawn at the pointer (keyboard drags use the overlay) */
    follow: activeId ? follow : null,
    activeAct: activeId ? (acts.get(activeId) ?? null) : null,
    dragging: activeId !== null,
    /** The level of the lane under the held card */
    overLevel: activeId ? overLevel : null,
    /** Another cell the held card would land in */
    target:
      target && activeId && target.cell !== cellOf(layout, activeId)
        ? target
        : null,
    dnd: {
      sensors,
      collisionDetection: collision,
      accessibility: { announcements },
      onDragStart,
      onDragOver,
      onDragEnd,
      onDragCancel,
    },
  };
}
