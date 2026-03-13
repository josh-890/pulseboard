"use client";

import { useCallback, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Lock,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CategoryGroupWithCategories } from "@/lib/services/category-service";
import {
  createCategoryGroupAction,
  updateCategoryGroupAction,
  deleteCategoryGroupAction,
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
} from "@/lib/actions/category-actions";

type MediaCategoryManagerProps = {
  groups: CategoryGroupWithCategories[];
};

const ENTITY_MODEL_OPTIONS = [
  { value: "", label: "None" },
  { value: "BodyMark", label: "Body Mark" },
  { value: "BodyModification", label: "Body Modification" },
  { value: "CosmeticProcedure", label: "Cosmetic Procedure" },
] as const;

function entityModelLabel(model: string | null): string {
  return (
    ENTITY_MODEL_OPTIONS.find((o) => o.value === (model ?? ""))?.label ?? "None"
  );
}

export function MediaCategoryManager({
  groups: initialGroups,
}: MediaCategoryManagerProps) {
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

  // ── Add category ──
  const [addingCategoryGroupId, setAddingCategoryGroupId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [newCatEntityModel, setNewCatEntityModel] = useState("");

  // ── Edit category ──
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [editCatEntityModel, setEditCatEntityModel] = useState("");

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
      const result = await createCategoryGroupAction(name);
      if (result.success) {
        setNewGroupName("");
        setShowAddGroup(false);
        // Reload will happen via revalidation
        window.location.reload();
      }
    });
  }, [newGroupName]);

  const handleUpdateGroup = useCallback(
    (id: string) => {
      if (!editGroupName.trim()) return;
      startTransition(async () => {
        await updateCategoryGroupAction(id, { name: editGroupName.trim() });
        setGroups((prev) =>
          prev.map((g) => (g.id === id ? { ...g, name: editGroupName.trim() } : g)),
        );
        setEditingGroupId(null);
      });
    },
    [editGroupName],
  );

  const handleDeleteGroup = useCallback(
    (id: string) => {
      startTransition(async () => {
        const result = await deleteCategoryGroupAction(id);
        if (result.success) {
          setGroups((prev) => prev.filter((g) => g.id !== id));
        }
      });
    },
    [],
  );

  // ── Category actions ──

  const handleAddCategory = useCallback(
    (groupId: string) => {
      if (!newCatName.trim()) return;
      const name = newCatName.trim();
      const entityModel = newCatEntityModel || null;
      startTransition(async () => {
        const result = await createCategoryAction(groupId, name, entityModel);
        if (result.success) {
          setNewCatName("");
          setNewCatEntityModel("");
          setAddingCategoryGroupId(null);
          window.location.reload();
        }
      });
    },
    [newCatName, newCatEntityModel],
  );

  const handleUpdateCategory = useCallback(
    (id: string) => {
      if (!editCatName.trim()) return;
      startTransition(async () => {
        await updateCategoryAction(id, {
          name: editCatName.trim(),
          entityModel: editCatEntityModel || null,
        });
        setGroups((prev) =>
          prev.map((g) => ({
            ...g,
            categories: g.categories.map((c) =>
              c.id === id
                ? { ...c, name: editCatName.trim(), entityModel: editCatEntityModel || null }
                : c,
            ),
          })),
        );
        setEditingCatId(null);
      });
    },
    [editCatName, editCatEntityModel],
  );

  const handleDeleteCategory = useCallback(
    (id: string) => {
      startTransition(async () => {
        const result = await deleteCategoryAction(id);
        if (result.success) {
          setGroups((prev) =>
            prev.map((g) => ({
              ...g,
              categories: g.categories.filter((c) => c.id !== id),
            })),
          );
        }
      });
    },
    [],
  );

  return (
    <div className={cn("space-y-3", isPending && "opacity-70 pointer-events-none")}>
      {groups.map((group) => {
        const isExpanded = expandedGroups.has(group.id);
        const isEditing = editingGroupId === group.id;
        const hasCategories = group.categories.length > 0;
        const hasSystemCategory = group.categories.some((c) => !!c.entityModel);

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
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              <GripVertical size={14} className="shrink-0 text-muted-foreground/50" />

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
                  <span className="flex-1 text-sm font-semibold">{group.name}</span>
                  <span className="mr-1 text-xs text-muted-foreground">
                    {group.categories.length} {group.categories.length === 1 ? "category" : "categories"}
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
                  {hasSystemCategory ? (
                    <span
                      className="rounded-md p-1 text-muted-foreground/40"
                      title="System group — contains entity-linked categories"
                    >
                      <Lock size={12} />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDeleteGroup(group.id)}
                      disabled={hasCategories}
                      className={cn(
                        "rounded-md p-1 transition-colors",
                        hasCategories
                          ? "text-muted-foreground/30 cursor-not-allowed"
                          : "text-muted-foreground hover:text-destructive",
                      )}
                      title={hasCategories ? "Remove all categories first" : "Delete group"}
                      aria-label="Delete group"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Categories */}
            {isExpanded && (
              <div className="border-t border-white/10 px-3 py-2 space-y-1">
                {group.categories.map((cat) => {
                  const isEditingCat = editingCatId === cat.id;

                  const isSystem = !!cat.entityModel;

                  if (isEditingCat) {
                    return (
                      <div
                        key={cat.id}
                        className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2"
                      >
                        <input
                          type="text"
                          value={editCatName}
                          onChange={(e) => setEditCatName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleUpdateCategory(cat.id);
                            if (e.key === "Escape") setEditingCatId(null);
                          }}
                          placeholder="Category name"
                          className="flex-1 rounded-md border border-white/15 bg-background/50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          autoFocus
                        />
                        {isSystem ? (
                          <span className="rounded-md border border-white/15 bg-background/50 px-2 py-1 text-xs text-muted-foreground">
                            {entityModelLabel(cat.entityModel)}
                          </span>
                        ) : (
                          <select
                            value={editCatEntityModel}
                            onChange={(e) => setEditCatEntityModel(e.target.value)}
                            className="rounded-md border border-white/15 bg-background/50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            {ENTITY_MODEL_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() => handleUpdateCategory(cat.id)}
                          className="rounded-md bg-primary/20 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/30"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCatId(null)}
                          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={cat.id}
                      className="group flex items-center gap-2 rounded-lg px-3 py-1.5 transition-colors hover:bg-muted/30"
                    >
                      <GripVertical size={12} className="shrink-0 text-muted-foreground/40" />
                      <span className="flex-1 text-sm">{cat.name}</span>
                      {cat.entityModel && (
                        <span className="rounded-full border border-white/15 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {entityModelLabel(cat.entityModel)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCatId(cat.id);
                          setEditCatName(cat.name);
                          setEditCatEntityModel(cat.entityModel ?? "");
                        }}
                        className="invisible rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground group-hover:visible"
                        aria-label="Edit category"
                      >
                        <Pencil size={11} />
                      </button>
                      {isSystem ? (
                        <span
                          className="rounded-md p-1 text-muted-foreground/40"
                          title="System category — linked to entity model"
                        >
                          <Lock size={11} />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="invisible rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive group-hover:visible"
                          aria-label="Delete category"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Add category form */}
                {addingCategoryGroupId === group.id ? (
                  <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 mt-1">
                    <input
                      type="text"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddCategory(group.id);
                        if (e.key === "Escape") setAddingCategoryGroupId(null);
                      }}
                      placeholder="Category name"
                      className="flex-1 rounded-md border border-white/15 bg-background/50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      autoFocus
                    />
                    <select
                      value={newCatEntityModel}
                      onChange={(e) => setNewCatEntityModel(e.target.value)}
                      className="rounded-md border border-white/15 bg-background/50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {ENTITY_MODEL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleAddCategory(group.id)}
                      className="rounded-md bg-primary/20 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/30"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingCategoryGroupId(null);
                        setNewCatName("");
                        setNewCatEntityModel("");
                      }}
                      className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingCategoryGroupId(group.id)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
                  >
                    <Plus size={12} />
                    Add category
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
