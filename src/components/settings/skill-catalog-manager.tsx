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
import type { SkillGroupWithDefinitions } from "@/lib/services/skill-catalog-service";
import {
  createSkillGroupAction,
  updateSkillGroupAction,
  deleteSkillGroupAction,
  createSkillDefinitionAction,
  updateSkillDefinitionAction,
  deleteSkillDefinitionAction,
} from "@/lib/actions/skill-catalog-actions";

type SkillCatalogManagerProps = {
  groups: SkillGroupWithDefinitions[];
};

export function SkillCatalogManager({
  groups: initialGroups,
}: SkillCatalogManagerProps) {
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
  const [newDefName, setNewDefName] = useState("");
  const [newDefDescription, setNewDefDescription] = useState("");

  // ── Edit definition ──
  const [editingDefId, setEditingDefId] = useState<string | null>(null);
  const [editDefName, setEditDefName] = useState("");
  const [editDefDescription, setEditDefDescription] = useState("");

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
      const result = await createSkillGroupAction(name);
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
        await updateSkillGroupAction(id, { name: editGroupName.trim() });
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
      const result = await deleteSkillGroupAction(id);
      if (result.success) {
        setGroups((prev) => prev.filter((g) => g.id !== id));
      }
    });
  }, []);

  // ── Definition actions ──

  const handleAddDefinition = useCallback(
    (groupId: string) => {
      if (!newDefName.trim()) return;
      const name = newDefName.trim();
      const description = newDefDescription.trim() || null;
      startTransition(async () => {
        const result = await createSkillDefinitionAction(
          groupId,
          name,
          description,
        );
        if (result.success) {
          setNewDefName("");
          setNewDefDescription("");
          setAddingDefGroupId(null);
          window.location.reload();
        }
      });
    },
    [newDefName, newDefDescription],
  );

  const handleUpdateDefinition = useCallback(
    (id: string) => {
      if (!editDefName.trim()) return;
      startTransition(async () => {
        await updateSkillDefinitionAction(id, {
          name: editDefName.trim(),
          description: editDefDescription.trim() || null,
        });
        setGroups((prev) =>
          prev.map((g) => ({
            ...g,
            definitions: g.definitions.map((d) =>
              d.id === id
                ? {
                    ...d,
                    name: editDefName.trim(),
                    description: editDefDescription.trim() || null,
                  }
                : d,
            ),
          })),
        );
        setEditingDefId(null);
      });
    },
    [editDefName, editDefDescription],
  );

  const handleDeleteDefinition = useCallback((id: string) => {
    startTransition(async () => {
      const result = await deleteSkillDefinitionAction(id);
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
                    {group.definitions.length === 1 ? "skill" : "skills"}
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
                        ? "Remove all skills first"
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
                      <div
                        key={def.id}
                        className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2"
                      >
                        <div className="flex flex-1 flex-col gap-1.5">
                          <input
                            type="text"
                            value={editDefName}
                            onChange={(e) => setEditDefName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                handleUpdateDefinition(def.id);
                              if (e.key === "Escape") setEditingDefId(null);
                            }}
                            placeholder="Skill name"
                            className="rounded-md border border-white/15 bg-background/50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                            autoFocus
                          />
                          <input
                            type="text"
                            value={editDefDescription}
                            onChange={(e) =>
                              setEditDefDescription(e.target.value)
                            }
                            placeholder="Description (optional)"
                            className="rounded-md border border-white/15 bg-background/50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUpdateDefinition(def.id)}
                          className="rounded-md bg-primary/20 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/30"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDefId(null)}
                          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                        >
                          <X size={12} />
                        </button>
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
                        <span className="text-sm">{def.name}</span>
                        {def.description && (
                          <p className="text-[11px] text-muted-foreground/70 truncate">
                            {def.description}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDefId(def.id);
                          setEditDefName(def.name);
                          setEditDefDescription(def.description ?? "");
                        }}
                        className="invisible rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground group-hover:visible"
                        aria-label="Edit skill"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDefinition(def.id)}
                        className="invisible rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive group-hover:visible"
                        aria-label="Delete skill"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}

                {/* Add definition form */}
                {addingDefGroupId === group.id ? (
                  <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 mt-1">
                    <div className="flex flex-1 flex-col gap-1.5">
                      <input
                        type="text"
                        value={newDefName}
                        onChange={(e) => setNewDefName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            handleAddDefinition(group.id);
                          if (e.key === "Escape") setAddingDefGroupId(null);
                        }}
                        placeholder="Skill name"
                        className="rounded-md border border-white/15 bg-background/50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={newDefDescription}
                        onChange={(e) => setNewDefDescription(e.target.value)}
                        placeholder="Description (optional)"
                        className="rounded-md border border-white/15 bg-background/50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddDefinition(group.id)}
                      className="rounded-md bg-primary/20 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/30"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingDefGroupId(null);
                        setNewDefName("");
                        setNewDefDescription("");
                      }}
                      className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingDefGroupId(group.id)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
                  >
                    <Plus size={12} />
                    Add skill
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
