"use client";

import { useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ContributionRoleGroupWithDefinitions } from "@/lib/services/contribution-role-service";
import {
  createContributionRoleGroupAction,
  updateContributionRoleGroupAction,
  deleteContributionRoleGroupAction,
  createContributionRoleDefinitionAction,
  updateContributionRoleDefinitionAction,
  deleteContributionRoleDefinitionAction,
} from "@/lib/actions/contribution-role-actions";

type ContributionRoleManagerProps = {
  groups: ContributionRoleGroupWithDefinitions[];
};

export function ContributionRoleManager({
  groups: initialGroups,
}: ContributionRoleManagerProps) {
  const [groups, setGroups] = useState(initialGroups);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(initialGroups.map((g) => g.id)),
  );
  const [isPending, startTransition] = useTransition();

  // ── Add group ──
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  function handleAddGroup() {
    if (!newGroupName.trim()) return;
    startTransition(async () => {
      const result = await createContributionRoleGroupAction(newGroupName.trim());
      if (result.success) {
        setNewGroupName("");
        setAddingGroup(false);
        // Optimistic: will revalidate
        window.location.reload();
      } else {
        toast.error(result.error ?? "Failed to create group");
      }
    });
  }

  // ── Edit group ──
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");

  function startEditGroup(group: ContributionRoleGroupWithDefinitions) {
    setEditingGroupId(group.id);
    setEditGroupName(group.name);
  }

  function handleUpdateGroup(id: string) {
    if (!editGroupName.trim()) return;
    startTransition(async () => {
      const result = await updateContributionRoleGroupAction(id, {
        name: editGroupName.trim(),
      });
      if (result.success) {
        setGroups((prev) =>
          prev.map((g) => (g.id === id ? { ...g, name: editGroupName.trim() } : g)),
        );
        setEditingGroupId(null);
      } else {
        toast.error(result.error ?? "Failed to update group");
      }
    });
  }

  function handleDeleteGroup(id: string) {
    startTransition(async () => {
      const result = await deleteContributionRoleGroupAction(id);
      if (result.success) {
        setGroups((prev) => prev.filter((g) => g.id !== id));
      } else {
        toast.error(result.error ?? "Failed to delete group");
      }
    });
  }

  // ── Add definition ──
  const [addingDefGroupId, setAddingDefGroupId] = useState<string | null>(null);
  const [newDefName, setNewDefName] = useState("");
  const [newDefDescription, setNewDefDescription] = useState("");

  function handleAddDefinition(groupId: string) {
    if (!newDefName.trim()) return;
    startTransition(async () => {
      const result = await createContributionRoleDefinitionAction(
        groupId,
        newDefName.trim(),
        newDefDescription.trim() || null,
      );
      if (result.success) {
        setNewDefName("");
        setNewDefDescription("");
        setAddingDefGroupId(null);
        window.location.reload();
      } else {
        toast.error(result.error ?? "Failed to create role");
      }
    });
  }

  // ── Edit definition ──
  const [editingDefId, setEditingDefId] = useState<string | null>(null);
  const [editDefName, setEditDefName] = useState("");
  const [editDefDescription, setEditDefDescription] = useState("");

  function startEditDef(def: ContributionRoleGroupWithDefinitions["definitions"][number]) {
    setEditingDefId(def.id);
    setEditDefName(def.name);
    setEditDefDescription(def.description ?? "");
  }

  function handleUpdateDef(id: string) {
    if (!editDefName.trim()) return;
    startTransition(async () => {
      const result = await updateContributionRoleDefinitionAction(id, {
        name: editDefName.trim(),
        description: editDefDescription.trim() || null,
      });
      if (result.success) {
        setGroups((prev) =>
          prev.map((g) => ({
            ...g,
            definitions: g.definitions.map((d) =>
              d.id === id
                ? { ...d, name: editDefName.trim(), description: editDefDescription.trim() || null }
                : d,
            ),
          })),
        );
        setEditingDefId(null);
      } else {
        toast.error(result.error ?? "Failed to update role");
      }
    });
  }

  function handleDeleteDef(id: string) {
    startTransition(async () => {
      const result = await deleteContributionRoleDefinitionAction(id);
      if (result.success) {
        setGroups((prev) =>
          prev.map((g) => ({
            ...g,
            definitions: g.definitions.filter((d) => d.id !== id),
          })),
        );
      } else {
        toast.error(result.error ?? "Failed to delete role");
      }
    });
  }

  function toggleGroup(id: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <div
          key={group.id}
          className="rounded-xl border border-white/15 bg-card/40"
        >
          {/* Group header */}
          <div className="flex items-center gap-2 px-3 py-2">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {expandedGroups.has(group.id) ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </button>

            {editingGroupId === group.id ? (
              <div className="flex flex-1 items-center gap-2">
                <input
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUpdateGroup(group.id);
                    if (e.key === "Escape") setEditingGroupId(null);
                  }}
                  className="flex-1 rounded border border-white/15 bg-muted/30 px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleUpdateGroup(group.id)}
                  disabled={isPending}
                  className="text-xs text-primary hover:underline"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingGroupId(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium">{group.name}</span>
                <span className="text-xs text-muted-foreground">
                  {group.definitions.length} roles
                </span>
                <button
                  type="button"
                  onClick={() => startEditGroup(group)}
                  className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteGroup(group.id)}
                  disabled={isPending || group.definitions.length > 0}
                  className={cn(
                    "rounded p-1 transition-colors",
                    group.definitions.length > 0
                      ? "text-muted-foreground/30 cursor-not-allowed"
                      : "text-muted-foreground hover:text-destructive",
                  )}
                  title={
                    group.definitions.length > 0
                      ? "Remove all roles first"
                      : "Delete group"
                  }
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>

          {/* Definitions */}
          {expandedGroups.has(group.id) && (
            <div className="border-t border-white/10 px-3 py-2 space-y-1">
              {group.definitions.map((def) => (
                <div
                  key={def.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/30 transition-colors"
                >
                  {editingDefId === def.id ? (
                    <div className="flex-1 space-y-1">
                      <input
                        value={editDefName}
                        onChange={(e) => setEditDefName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleUpdateDef(def.id);
                          if (e.key === "Escape") setEditingDefId(null);
                        }}
                        placeholder="Role name"
                        className="w-full rounded border border-white/15 bg-muted/30 px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        autoFocus
                      />
                      <input
                        value={editDefDescription}
                        onChange={(e) => setEditDefDescription(e.target.value)}
                        placeholder="Description (optional)"
                        className="w-full rounded border border-white/15 bg-muted/30 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdateDef(def.id)}
                          disabled={isPending}
                          className="text-xs text-primary hover:underline"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDefId(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm">{def.name}</span>
                        {def.description && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {def.description}
                          </span>
                        )}
                        <span className="ml-2 text-[10px] text-muted-foreground/50">
                          {def.slug}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEditDef(def)}
                        className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDef(def.id)}
                        disabled={isPending}
                        className="rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              ))}

              {/* Add definition form */}
              {addingDefGroupId === group.id ? (
                <div className="space-y-1 rounded-lg border border-dashed border-white/15 px-2 py-2">
                  <input
                    value={newDefName}
                    onChange={(e) => setNewDefName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddDefinition(group.id);
                      if (e.key === "Escape") setAddingDefGroupId(null);
                    }}
                    placeholder="Role name"
                    className="w-full rounded border border-white/15 bg-muted/30 px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    autoFocus
                  />
                  <input
                    value={newDefDescription}
                    onChange={(e) => setNewDefDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full rounded border border-white/15 bg-muted/30 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleAddDefinition(group.id)}
                      disabled={isPending || !newDefName.trim()}
                      className="text-xs text-primary hover:underline disabled:opacity-50"
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
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAddingDefGroupId(group.id);
                    setNewDefName("");
                    setNewDefDescription("");
                  }}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus size={12} />
                  Add role
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Add group */}
      {addingGroup ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-2">
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddGroup();
              if (e.key === "Escape") setAddingGroup(false);
            }}
            placeholder="Group name"
            className="flex-1 rounded border border-white/15 bg-muted/30 px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
          <button
            type="button"
            onClick={handleAddGroup}
            disabled={isPending || !newGroupName.trim()}
            className="text-xs text-primary hover:underline disabled:opacity-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAddingGroup(false);
              setNewGroupName("");
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingGroup(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus size={14} />
          Add group
        </button>
      )}
    </div>
  );
}
