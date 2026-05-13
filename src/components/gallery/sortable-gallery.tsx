"use client";

import { useState } from "react";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { GalleryItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SortableGalleryProps = {
  items: GalleryItem[];
  onReorder: (orderedIds: string[]) => void;
  onOpen: (id: string) => void;
};

type SortableItemProps = {
  item: GalleryItem;
  isActiveDrag: boolean;
  onOpen: (id: string) => void;
};

function SortableItem({ item, isActiveDrag, onOpen }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const thumbUrl =
    item.urls.gallery_512 ?? item.urls.view_1200 ?? item.urls.gallery_1024 ?? item.urls.original;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(item.id)}
      className={cn(
        "group relative aspect-square w-full overflow-hidden rounded-lg bg-muted/30 ring-1 ring-white/5",
        "cursor-grab active:cursor-grabbing",
        isActiveDrag && "opacity-30",
      )}
    >
      {thumbUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl}
          alt={item.caption ?? item.filename}
          draggable={false}
          className="h-full w-full object-cover pointer-events-none select-none"
        />
      )}
      {/* Visual drag handle indicator */}
      <div
        className="absolute left-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded bg-black/60 text-white/70 opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      >
        <GripVertical size={12} />
      </div>
    </div>
  );
}

export function SortableGallery({ items, onReorder, onOpen }: SortableGalleryProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeItem = activeId ? items.find((it) => it.id === activeId) : null;
  const overlayUrl = activeItem
    ? (activeItem.urls.gallery_512 ?? activeItem.urls.view_1200 ?? activeItem.urls.gallery_1024 ?? activeItem.urls.original)
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((it) => it.id === active.id);
    const newIndex = items.findIndex((it) => it.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(items, oldIndex, newIndex).map((it) => it.id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((it) => it.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
          {items.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              isActiveDrag={item.id === activeId}
              onOpen={onOpen}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {overlayUrl && (
          <div className="aspect-square w-[120px] overflow-hidden rounded-lg shadow-2xl ring-2 ring-primary/50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={overlayUrl}
              alt="Dragging"
              className="h-full w-full object-cover"
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
