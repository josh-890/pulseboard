"use client";

import { useState } from "react";
import { Check, Minus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useTagSlots } from "@/hooks/use-tag-slots";
import type { PaletteTag } from "@/lib/services/tag-service";
import { tagFitsEntity, type TaggableEntity } from "@/lib/tag-domains";
import { cn } from "@/lib/utils";
import { TagPalette } from "./tag-palette";

const POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type SlotState = "all" | "some" | "none";

export type TagSlotBarProps = {
  entityType: TaggableEntity;
  /** Apply (toggle) a slot's tag on the current item / selection */
  onApplySlot: (tag: PaletteTag) => void;
  /** Whether the current item / selection carries a tag — drives the ✓ / – mark */
  stateOf?: (tagId: string) => SlotState;
  tone?: "default" | "onDark";
};

// Quick-tag slots 1–9 (ADR-0033, S3; Lightroom's keyword sets). Click a slot
// or press its digit to toggle that tag. The pencil switches to set-up: click
// a slot to choose its tag, ✕ to empty it, and name / add / delete sets. A
// slot whose tag cannot apply here (e.g. a person trait on an image) is
// greyed out.
export function TagSlotBar({ entityType, onApplySlot, stateOf, tone = "default" }: TagSlotBarProps) {
  const slots = useTagSlots();
  const [editing, setEditing] = useState(false);
  const [pickFor, setPickFor] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const onDark = tone === "onDark";
  const muted = onDark ? "text-white/50" : "text-muted-foreground";
  const border = onDark ? "border-white/15" : "border-white/15";

  if (!slots.active) {
    return <span className={cn("text-xs", muted)}>Loading slots…</span>;
  }
  const active = slots.active;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <select
          value={active.id}
          onChange={(e) => slots.switchTo(e.target.value)}
          className={cn(
            "max-w-[10rem] truncate rounded-md border bg-transparent px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring",
            border,
            onDark ? "text-white/80 [&>option]:text-black" : "text-foreground",
          )}
          aria-label="Quick-tag slot set"
        >
          {slots.sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className={cn(
            "rounded-md p-1 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            editing ? "bg-primary/20 text-primary" : cn(muted, onDark ? "hover:text-white" : "hover:text-foreground"),
          )}
          aria-pressed={editing}
          aria-label={editing ? "Done setting up slots" : "Set up slots"}
          title={editing ? "Done" : "Set up slots"}
        >
          {editing ? <Check size={12} /> : <Pencil size={12} />}
        </button>
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Quick-tag slots, keys 1 to 9">
        {POSITIONS.map((pos) => {
          const tag = slots.slotTag(pos);
          const fits = tag ? tagFitsEntity(tag.group.domain, entityType) : false;
          const state = tag && stateOf ? stateOf(tag.id) : "none";
          return (
            <span key={pos} className="inline-flex items-center">
              <button
                type="button"
                disabled={!editing && (!tag || !fits)}
                onClick={() => (editing ? setPickFor(pos) : tag && onApplySlot(tag))}
                className={cn(
                  "inline-flex max-w-[8.5rem] items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
                  border,
                  onDark ? "text-white/85 hover:bg-white/10" : "text-foreground hover:bg-muted/40",
                  !tag && "border-dashed",
                  state === "all" && "bg-primary/15",
                )}
                aria-label={
                  tag
                    ? `Slot ${pos}: ${tag.name}${editing ? " — change" : ""}`
                    : `Slot ${pos} empty${editing ? " — choose a tag" : ""}`
                }
                title={tag && !fits ? `${tag.name} cannot be applied here` : undefined}
              >
                <kbd className={cn("text-[10px] tabular-nums", muted)}>{pos}</kbd>
                {tag ? (
                  <>
                    <span
                      className="inline-block size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.group.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{tag.name}</span>
                    {state === "all" && <Check size={10} aria-hidden="true" />}
                    {state === "some" && <Minus size={10} aria-hidden="true" />}
                  </>
                ) : (
                  <span className={muted}>{editing ? "+" : "—"}</span>
                )}
              </button>
              {editing && tag && (
                <button
                  type="button"
                  onClick={() => slots.assign(pos, null)}
                  className={cn("rounded p-0.5", muted, "hover:text-destructive")}
                  aria-label={`Empty slot ${pos}`}
                >
                  <X size={10} />
                </button>
              )}
            </span>
          );
        })}
      </div>

      {editing && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) {
                slots.createSet(newName);
                setNewName("");
              }
            }}
            placeholder="New set name…"
            className={cn(
              "w-32 rounded-md border bg-transparent px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring",
              border,
              onDark ? "text-white placeholder:text-white/30" : "",
            )}
            aria-label="New slot set name"
          />
          <button
            type="button"
            disabled={!newName.trim()}
            onClick={() => {
              slots.createSet(newName);
              setNewName("");
            }}
            className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs disabled:opacity-40", muted)}
          >
            <Plus size={11} /> Add set
          </button>
          <button
            type="button"
            onClick={() => {
              const name = window.prompt("Rename slot set", active.name);
              if (name && name.trim()) slots.renameSet(active.id, name);
            }}
            className={cn("rounded-md px-1.5 py-0.5 text-xs", muted)}
          >
            Rename
          </button>
          {slots.sets.length > 1 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete slot set “${active.name}”? The tags themselves stay.`)) {
                  slots.deleteSet(active.id);
                }
              }}
              className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs", muted, "hover:text-destructive")}
            >
              <Trash2 size={11} /> Delete set
            </button>
          )}
        </div>
      )}

      <TagPalette
        open={pickFor !== null}
        onOpenChange={(o) => {
          if (!o) setPickFor(null);
        }}
        entityType={entityType}
        title={pickFor !== null ? `Tag for slot ${pickFor}` : undefined}
        onPick={(tag) => {
          if (pickFor !== null) slots.assign(pickFor, tag);
          setPickFor(null);
        }}
      />
    </div>
  );
}
