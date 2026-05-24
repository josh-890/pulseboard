"use client";

import { useCallback, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PhysicalAttributeGroupWithDefinitions } from "@/lib/services/physical-attribute-catalog-service";
import {
  createPhysicalAttributeGroupAction,
  updatePhysicalAttributeGroupAction,
  deletePhysicalAttributeGroupAction,
  createPhysicalAttributeDefinitionAction,
  updatePhysicalAttributeDefinitionAction,
  deletePhysicalAttributeDefinitionAction,
} from "@/lib/actions/physical-attribute-catalog-actions";
import {
  PhysicalAttributeDefinitionForm,
  type DefinitionFormValue,
} from "./physical-attribute-definition-form";
import type { PhysicalAttributeValueType } from "@/generated/prisma/client";

const TYPE_BADGE_LABEL: Record<PhysicalAttributeValueType, string> = {
  BOOLEAN: "bool",
  SINGLE_SELECT: "select",
  MULTI_SELECT: "multi",
  ORDINAL: "ordinal",
  NUMERIC: "numeric",
  TEXT: "text",
};

type PhysicalAttributeManagerProps = {
  groups: PhysicalAttributeGroupWithDefinitions[];
};

export function PhysicalAttributeManager({
  groups: initialGroups,
}: PhysicalAttributeManagerProps) {
  const [groups, setGroups] = useState(initialGroups);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(initialGroups.map((g) => g.id)),
  );
  const [isPending, startTransition] = useTransition();

  // ── Add group ──
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  // ── Edit group ──
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");

  // ── Add definition ──
  const [addingDefGroupId, setAddingDefGroupId] = useState<string | null>(null);

  // ── Edit definition ──
  const [editingDefId, setEditingDefId] = useState<string | null>(null);

  const toggleGroup = useCallback((id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Group actions ──

  const handleAddGroup = useCallback(() => {
    if (!newGroupName.trim()) return;
    const name = newGroupName.trim();
    startTransition(async () => {
      const result = await createPhysicalAttributeGroupAction(name);
      if (result.success) {
        setNewGroupName("");
        setShowAddGroup(false);
        window.location.reload();
      }
    });
  }, [newGroupName]);

  const handleUpdateGroup = useCallback(
    (id: string) => {
      if (!editGroupName.trim()) return;
      startTransition(async () => {
        await updatePhysicalAttributeGroupAction(id, {
          name: editGroupName.trim(),
        });
        setGroups((prev) =>
          prev.map((g) =>
            g.id === id ? { ...g, name: editGroupName.trim() } : g,
          ),
        );
        setEditingGroupId(null);
      });
    },
    [editGroupName],
  );

  const handleDeleteGroup = useCallback((id: string) => {
    startTransition(async () => {
      const result = await deletePhysicalAttributeGroupAction(id);
      if (result.success) {
        setGroups((prev) => prev.filter((g) => g.id !== id));
      }
    });
  }, []);

  // ── Definition actions ──

  const handleAddDefinition = useCallback(
    (groupId: string, value: DefinitionFormValue) => {
      startTransition(async () => {
        const result = await createPhysicalAttributeDefinitionAction({
          groupId,
          name: value.name,
          unit: value.unit,
          valueType: value.valueType,
          allowedValues: value.allowedValues,
          ordinalMin: value.ordinalMin,
          ordinalMax: value.ordinalMax,
          mutability: value.mutability,
          statusBearing: value.statusBearing,
        });
        if (result.success) {
          setAddingDefGroupId(null);
          window.location.reload();
        } else {
          alert(result.error ?? "Failed to add attribute");
        }
      });
    },
    [],
  );

  const handleUpdateDefinition = useCallback(
    (id: string, value: DefinitionFormValue) => {
      startTransition(async () => {
        const result = await updatePhysicalAttributeDefinitionAction(id, {
          name: value.name,
          unit: value.unit,
          valueType: value.valueType,
          allowedValues: value.allowedValues,
          ordinalMin: value.ordinalMin,
          ordinalMax: value.ordinalMax,
          mutability: value.mutability,
          statusBearing: value.statusBearing,
        });
        if (!result.success) {
          alert(result.error ?? "Failed to update attribute");
          return;
        }
        setGroups((prev) =>
          prev.map((g) => ({
            ...g,
            definitions: g.definitions.map((d) =>
              d.id === id
                ? {
                    ...d,
                    name: value.name,
                    unit: value.unit,
                    valueType: value.valueType,
                    allowedValues: value.allowedValues,
                    ordinalMin: value.ordinalMin,
                    ordinalMax: value.ordinalMax,
                    mutability: value.mutability,
                    statusBearing: value.statusBearing,
                  }
                : d,
            ),
          })),
        );
        setEditingDefId(null);
      });
    },
    [],
  );

  const handleDeleteDefinition = useCallback((id: string) => {
    startTransition(async () => {
      const result = await deletePhysicalAttributeDefinitionAction(id);
      if (result.success) {
        setGroups((prev) =>
          prev.map((g) => ({
            ...g,
            definitions: g.definitions.filter((d) => d.id !== id),
          })),
        );
      }
    });
  }, []);

  return (
    <div
      className={cn(
        "space-y-3",
        isPending && "opacity-70 pointer-events-none",
      )}
    >
      {groups.map((group) => {
        const isExpanded = expandedGroups.has(group.id);
        const isEditing = editingGroupId === group.id;
        const hasDefinitions = group.definitions.length > 0;

        return (
          <div
            key={group.id}
            className="rounded-xl border border-white/15 bg-muted/20"
          >
            {/* Group header */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </button>

              <GripVertical
                size={14}
                className="shrink-0 text-muted-foreground/50"
              />

              {isEditing ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    type="text"
                    value={editGroupName}
                    onChange={(e) => setEditGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdateGroup(group.id);
                      if (e.key === "Escape") setEditingGroupId(null);
                    }}
                    className="flex-1 rounded-md border border-white/15 bg-background/50 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdateGroup(group.id)}
                    className="rounded-md bg-primary/20 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/30"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingGroupId(null)}
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <>
                  <span className="flex-1 text-sm font-semibold">
                    {group.name}
                  </span>
                  <span className="mr-1 text-xs text-muted-foreground">
                    {group.definitions.length}{" "}
                    {group.definitions.length === 1
                      ? "attribute"
                      : "attributes"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingGroupId(group.id);
                      setEditGroupName(group.name);
                    }}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Edit group"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteGroup(group.id)}
                    disabled={hasDefinitions}
                    className={cn(
                      "rounded-md p-1 transition-colors",
                      hasDefinitions
                        ? "text-muted-foreground/30 cursor-not-allowed"
                        : "text-muted-foreground hover:text-destructive",
                    )}
                    title={
                      hasDefinitions
                        ? "Remove all attributes first"
                        : "Delete group"
                    }
                    aria-label="Delete group"
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>

            {/* Definitions */}
            {isExpanded && (
              <div className="border-t border-white/10 px-3 py-2 space-y-1">
                {group.definitions.map((def) => {
                  const isEditingDef = editingDefId === def.id;

                  if (isEditingDef) {
                    return (
                      <div key={def.id} className="px-1 py-1">
                        <PhysicalAttributeDefinitionForm
                          initial={{
                            name: def.name,
                            unit: def.unit,
                            valueType: def.valueType,
                            allowedValues: def.allowedValues,
                            ordinalMin: def.ordinalMin,
                            ordinalMax: def.ordinalMax,
                            mutability: def.mutability,
                            statusBearing: def.statusBearing,
                          }}
                          onCancel={() => setEditingDefId(null)}
                          onSubmit={(v) => handleUpdateDefinition(def.id, v)}
                          submitLabel="Save"
                          busy={isPending}
                        />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={def.id}
                      className="group flex items-center gap-2 rounded-lg px-3 py-1.5 transition-colors hover:bg-muted/30"
                    >
                      <GripVertical
                        size={12}
                        className="shrink-0 text-muted-foreground/40"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{def.name}</span>
                          <span className="text-[10px] rounded px-1.5 py-0.5 font-medium shrink-0 bg-muted/60 text-muted-foreground">
                            {TYPE_BADGE_LABEL[def.valueType]}
                            {def.valueType === "SINGLE_SELECT" || def.valueType === "MULTI_SELECT"
                              ? ` · ${def.allowedValues.length}`
                              : def.valueType === "NUMERIC" && def.unit
                              ? ` · ${def.unit}`
                              : def.valueType === "ORDINAL" && def.ordinalMin != null && def.ordinalMax != null
                              ? ` · ${def.ordinalMin}–${def.ordinalMax}`
                              : ""}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] rounded px-1.5 py-0.5 font-medium shrink-0",
                              def.mutability === "ALWAYS_STATIC" && "bg-sky-500/15 text-sky-400",
                              def.mutability === "RARELY_CHANGES" && "bg-muted/40 text-muted-foreground/80",
                              def.mutability === "VOLATILE" && "bg-amber-500/15 text-amber-400",
                            )}
                            title={`Mutability: ${def.mutability}`}
                          >
                            {def.mutability === "ALWAYS_STATIC" ? "static" : def.mutability === "VOLATILE" ? "volatile" : "rarely"}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingDefId(def.id)}
                        className="invisible rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground group-hover:visible"
                        aria-label="Edit attribute"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDefinition(def.id)}
                        className="invisible rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive group-hover:visible"
                        aria-label="Delete attribute"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}

                {/* Add definition form */}
                {addingDefGroupId === group.id ? (
                  <div className="mt-1 px-1 py-1">
                    <PhysicalAttributeDefinitionForm
                      onCancel={() => setAddingDefGroupId(null)}
                      onSubmit={(v) => handleAddDefinition(group.id, v)}
                      submitLabel="Add"
                      busy={isPending}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingDefGroupId(group.id)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
                  >
                    <Plus size={12} />
                    Add attribute
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Add group */}
      {showAddGroup ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-muted/20 px-3 py-2.5">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddGroup();
              if (e.key === "Escape") setShowAddGroup(false);
            }}
            placeholder="Group name"
            className="flex-1 rounded-md border border-white/15 bg-background/50 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          <button
            type="button"
            onClick={handleAddGroup}
            className="rounded-md bg-primary/20 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/30"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAddGroup(false);
              setNewGroupName("");
            }}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddGroup(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 py-3 text-sm text-muted-foreground transition-colors hover:border-white/30 hover:text-foreground"
        >
          <Plus size={14} />
          Add Group
        </button>
      )}
    </div>
  );
}
