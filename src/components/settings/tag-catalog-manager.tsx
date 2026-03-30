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
import type { TagGroupWithDefinitions } from "@/lib/services/tag-service";
import {
  createTagGroupAction,
  updateTagGroupAction,
  deleteTagGroupAction,
  createTagDefinitionAction,
  updateTagDefinitionAction,
  deleteTagDefinitionAction,
  createTagAliasAction,
  deleteTagAliasAction,
} from "@/lib/actions/tag-actions";

type TagCatalogManagerProps = {
  groups: TagGroupWithDefinitions[];
};

const SCOPE_OPTIONS = [
  { value: "PERSON", label: "Person", short: "P" },
  { value: "SESSION", label: "Session", short: "S" },
  { value: "MEDIA_ITEM", label: "Media", short: "M" },
  { value: "SET", label: "Set", short: "Set" },
  { value: "PROJECT", label: "Project", short: "Prj" },
] as const;

const PRESET_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#9ca3af",
] as const;

function ColorDot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ backgroundColor: color, width: size, height: size }}
    />
  );
}

function ScopeBadges({ scope }: { scope: string[] }) {
  return (
    <div className="flex gap-0.5">
      {SCOPE_OPTIONS.map((opt) => (
        <span
          key={opt.value}
          className={cn(
            "rounded px-1 py-0.5 text-[9px] font-medium leading-none",
            scope.includes(opt.value)
              ? "bg-primary/20 text-primary"
              : "bg-muted/20 text-muted-foreground/30",
          )}
        >
          {opt.short}
        </span>
      ))}
    </div>
  );
}

function ScopeCheckboxes({
  scope,
  onChange,
}: {
  scope: string[];
  onChange: (scope: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {SCOPE_OPTIONS.map((opt) => (
        <label
          key={opt.value}
          className="flex items-center gap-1 text-xs text-muted-foreground"
        >
          <input
            type="checkbox"
            checked={scope.includes(opt.value)}
            onChange={(e) => {
              if (e.target.checked) {
                onChange([...scope, opt.value]);
              } else {
                onChange(scope.filter((s) => s !== opt.value));
              }
            }}
            className="h-3 w-3 rounded border-white/20 bg-background/50"
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {PRESET_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={cn(
            "h-5 w-5 rounded-full border-2 transition-transform hover:scale-110",
            value === color ? "border-foreground scale-110" : "border-transparent",
          )}
          style={{ backgroundColor: color }}
          aria-label={`Select color ${color}`}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
        title="Custom color"
      />
    </div>
  );
}

export function TagCatalogManager({
  groups: initialGroups,
}: TagCatalogManagerProps) {
  const [groups, setGroups] = useState(initialGroups);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(initialGroups.map((g) => g.id)),
  );
  const [isPending, startTransition] = useTransition();

  // ── Add group ──
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("#6b7280");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [newGroupExclusive, setNewGroupExclusive] = useState(false);

  // ── Edit group ──
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupColor, setEditGroupColor] = useState("");
  const [editGroupDescription, setEditGroupDescription] = useState("");
  const [editGroupExclusive, setEditGroupExclusive] = useState(false);

  // ── Add tag ──
  const [addingTagGroupId, setAddingTagGroupId] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagScope, setNewTagScope] = useState<string[]>([
    "PERSON", "SESSION", "MEDIA_ITEM", "SET", "PROJECT",
  ]);
  const [newTagDescription, setNewTagDescription] = useState("");

  // ── Edit tag ──
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editTagName, setEditTagName] = useState("");
  const [editTagScope, setEditTagScope] = useState<string[]>([]);
  const [editTagDescription, setEditTagDescription] = useState("");

  // ── Alias input ──
  const [aliasTagId, setAliasTagId] = useState<string | null>(null);
  const [newAliasName, setNewAliasName] = useState("");

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
    const color = newGroupColor;
    const description = newGroupDescription.trim() || undefined;
    const isExclusive = newGroupExclusive;
    startTransition(async () => {
      const result = await createTagGroupAction(name, color, description, isExclusive);
      if (result.success) {
        setNewGroupName("");
        setNewGroupColor("#6b7280");
        setNewGroupDescription("");
        setNewGroupExclusive(false);
        setShowAddGroup(false);
        window.location.reload();
      }
    });
  }, [newGroupName, newGroupColor, newGroupDescription, newGroupExclusive]);

  const handleUpdateGroup = useCallback(
    (id: string) => {
      if (!editGroupName.trim()) return;
      startTransition(async () => {
        await updateTagGroupAction(id, {
          name: editGroupName.trim(),
          color: editGroupColor,
          description: editGroupDescription.trim() || null,
          isExclusive: editGroupExclusive,
        });
        setGroups((prev) =>
          prev.map((g) =>
            g.id === id
              ? {
                  ...g,
                  name: editGroupName.trim(),
                  color: editGroupColor,
                  description: editGroupDescription.trim() || null,
                  isExclusive: editGroupExclusive,
                }
              : g,
          ),
        );
        setEditingGroupId(null);
      });
    },
    [editGroupName, editGroupColor, editGroupDescription, editGroupExclusive],
  );

  const handleDeleteGroup = useCallback((id: string) => {
    startTransition(async () => {
      const result = await deleteTagGroupAction(id);
      if (result.success) {
        setGroups((prev) => prev.filter((g) => g.id !== id));
      }
    });
  }, []);

  // ── Tag actions ──

  const handleAddTag = useCallback(
    (groupId: string) => {
      if (!newTagName.trim()) return;
      const name = newTagName.trim();
      const scope = newTagScope;
      const description = newTagDescription.trim() || undefined;
      startTransition(async () => {
        const result = await createTagDefinitionAction(groupId, name, scope, description);
        if (result.success) {
          setNewTagName("");
          setNewTagScope(["PERSON", "SESSION", "MEDIA_ITEM", "SET", "PROJECT"]);
          setNewTagDescription("");
          setAddingTagGroupId(null);
          window.location.reload();
        }
      });
    },
    [newTagName, newTagScope, newTagDescription],
  );

  const handleUpdateTag = useCallback(
    (id: string) => {
      if (!editTagName.trim()) return;
      startTransition(async () => {
        await updateTagDefinitionAction(id, {
          name: editTagName.trim(),
          scope: editTagScope,
          description: editTagDescription.trim() || null,
        });
        setGroups((prev) =>
          prev.map((g) => ({
            ...g,
            tags: g.tags.map((t) =>
              t.id === id
                ? { ...t, name: editTagName.trim(), scope: editTagScope, description: editTagDescription.trim() || null }
                : t,
            ),
          })),
        );
        setEditingTagId(null);
      });
    },
    [editTagName, editTagScope, editTagDescription],
  );

  const handleDeleteTag = useCallback((id: string) => {
    startTransition(async () => {
      const result = await deleteTagDefinitionAction(id);
      if (result.success) {
        setGroups((prev) =>
          prev.map((g) => ({
            ...g,
            tags: g.tags.filter((t) => t.id !== id),
          })),
        );
      }
    });
  }, []);

  // ── Alias actions ──

  const handleAddAlias = useCallback(
    (tagId: string) => {
      if (!newAliasName.trim()) return;
      const name = newAliasName.trim();
      startTransition(async () => {
        const result = await createTagAliasAction(tagId, name);
        if (result.success) {
          setNewAliasName("");
          window.location.reload();
        }
      });
    },
    [newAliasName],
  );

  const handleDeleteAlias = useCallback((aliasId: string) => {
    startTransition(async () => {
      await deleteTagAliasAction(aliasId);
      window.location.reload();
    });
  }, []);

  return (
    <div className={cn("space-y-3", isPending && "opacity-70 pointer-events-none")}>
      {groups.map((group) => {
        const isExpanded = expandedGroups.has(group.id);
        const isEditing = editingGroupId === group.id;
        const hasTags = group.tags.length > 0;
        const pendingCount = group.tags.filter((t) => t.status === "pending").length;

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

              <ColorDot color={group.color} />

              {isEditing ? (
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex items-center gap-2">
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
                  <ColorPicker value={editGroupColor} onChange={setEditGroupColor} />
                  <input
                    type="text"
                    value={editGroupDescription}
                    onChange={(e) => setEditGroupDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="rounded-md border border-white/15 bg-background/50 px-2 py-1 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={editGroupExclusive}
                      onChange={(e) => setEditGroupExclusive(e.target.checked)}
                      className="h-3 w-3 rounded border-white/20 bg-background/50"
                    />
                    <Lock size={11} className="text-muted-foreground/50" />
                    Exclusive (only one tag per entity)
                  </label>
                </div>
              ) : (
                <>
                  <span className="flex items-center gap-1.5 flex-1 text-sm font-semibold">
                    {group.name}
                    {group.isExclusive && (
                      <Lock size={11} className="text-muted-foreground/50" title="Exclusive group" />
                    )}
                  </span>
                  {group.description && (
                    <span className="mr-1 hidden text-xs text-muted-foreground/60 md:inline">
                      {group.description}
                    </span>
                  )}
                  {pendingCount > 0 && (
                    <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      {pendingCount} pending
                    </span>
                  )}
                  <span className="mr-1 text-xs text-muted-foreground">
                    {group.tags.length} {group.tags.length === 1 ? "tag" : "tags"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingGroupId(group.id);
                      setEditGroupName(group.name);
                      setEditGroupColor(group.color);
                      setEditGroupDescription(group.description ?? "");
                      setEditGroupExclusive(group.isExclusive);
                    }}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Edit group"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteGroup(group.id)}
                    disabled={hasTags}
                    className={cn(
                      "rounded-md p-1 transition-colors",
                      hasTags
                        ? "text-muted-foreground/30 cursor-not-allowed"
                        : "text-muted-foreground hover:text-destructive",
                    )}
                    title={hasTags ? "Remove all tags first" : "Delete group"}
                    aria-label="Delete group"
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>

            {/* Tags */}
            {isExpanded && (
              <div className="border-t border-white/10 px-3 py-2 space-y-1">
                {group.tags.map((tag) => {
                  const isEditingTag = editingTagId === tag.id;
                  const isShowingAliases = aliasTagId === tag.id;

                  if (isEditingTag) {
                    return (
                      <div
                        key={tag.id}
                        className="flex flex-col gap-2 rounded-lg bg-muted/30 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editTagName}
                            onChange={(e) => setEditTagName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleUpdateTag(tag.id);
                              if (e.key === "Escape") setEditingTagId(null);
                            }}
                            placeholder="Tag name"
                            className="flex-1 rounded-md border border-white/15 bg-background/50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateTag(tag.id)}
                            className="rounded-md bg-primary/20 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/30"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTagId(null)}
                            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <ScopeCheckboxes
                          scope={editTagScope}
                          onChange={setEditTagScope}
                        />
                        <textarea
                          value={editTagDescription}
                          onChange={(e) => setEditTagDescription(e.target.value)}
                          placeholder="Description (optional, max 500 chars)"
                          maxLength={500}
                          rows={2}
                          className="rounded-md border border-white/15 bg-background/50 px-2 py-1 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />

                        {/* Aliases section */}
                        <div className="space-y-1">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                            Aliases
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {tag.aliases?.map((alias) => (
                              <span
                                key={alias.id}
                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                              >
                                {alias.name}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAlias(alias.id)}
                                  className="rounded-full p-0.5 hover:bg-foreground/10"
                                  aria-label={`Remove alias ${alias.name}`}
                                >
                                  <X size={8} />
                                </button>
                              </span>
                            ))}
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={isShowingAliases ? newAliasName : ""}
                                onChange={(e) => {
                                  setAliasTagId(tag.id);
                                  setNewAliasName(e.target.value);
                                }}
                                onFocus={() => setAliasTagId(tag.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleAddAlias(tag.id);
                                  if (e.key === "Escape") {
                                    setAliasTagId(null);
                                    setNewAliasName("");
                                  }
                                }}
                                placeholder="+ alias"
                                className="w-20 rounded border border-white/10 bg-background/30 px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={tag.id}
                      className="group flex items-center gap-2 rounded-lg px-3 py-1.5 transition-colors hover:bg-muted/30"
                    >
                      <GripVertical size={12} className="shrink-0 text-muted-foreground/40" />
                      <ColorDot color={group.color} size={8} />
                      <div className="flex flex-1 flex-col min-w-0">
                        <span className="flex items-center gap-1.5 text-sm">
                          {tag.name}
                          {tag.status === "pending" && (
                            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400">
                              pending
                            </span>
                          )}
                        </span>
                        {tag.description && (
                          <span className="text-[10px] text-muted-foreground/50 truncate">
                            {tag.description}
                          </span>
                        )}
                        {tag.aliases && tag.aliases.length > 0 && (
                          <span className="text-[10px] text-muted-foreground/40">
                            aliases: {tag.aliases.map((a) => a.name).join(", ")}
                          </span>
                        )}
                      </div>
                      <ScopeBadges scope={tag.scope} />
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTagId(tag.id);
                          setEditTagName(tag.name);
                          setEditTagScope([...tag.scope]);
                          setEditTagDescription(tag.description ?? "");
                          setAliasTagId(tag.id);
                        }}
                        className="invisible rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground group-hover:visible"
                        aria-label="Edit tag"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTag(tag.id)}
                        className="invisible rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive group-hover:visible"
                        aria-label="Delete tag"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}

                {/* Add tag form */}
                {addingTagGroupId === group.id ? (
                  <div className="flex flex-col gap-2 rounded-lg bg-muted/30 px-3 py-2 mt-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddTag(group.id);
                          if (e.key === "Escape") setAddingTagGroupId(null);
                        }}
                        placeholder="Tag name"
                        className="flex-1 rounded-md border border-white/15 bg-background/50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleAddTag(group.id)}
                        className="rounded-md bg-primary/20 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/30"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddingTagGroupId(null);
                          setNewTagName("");
                          setNewTagScope(["PERSON", "SESSION", "MEDIA_ITEM", "SET", "PROJECT"]);
                          setNewTagDescription("");
                        }}
                        className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <ScopeCheckboxes scope={newTagScope} onChange={setNewTagScope} />
                    <input
                      type="text"
                      value={newTagDescription}
                      onChange={(e) => setNewTagDescription(e.target.value)}
                      placeholder="Description (optional)"
                      className="rounded-md border border-white/15 bg-background/50 px-2 py-1 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingTagGroupId(group.id)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
                  >
                    <Plus size={12} />
                    Add tag
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Add group */}
      {showAddGroup ? (
        <div className="rounded-xl border border-white/15 bg-muted/20 px-3 py-3 space-y-2">
          <div className="flex items-center gap-2">
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
                setNewGroupColor("#6b7280");
                setNewGroupDescription("");
                setNewGroupExclusive(false);
              }}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>
          <ColorPicker value={newGroupColor} onChange={setNewGroupColor} />
          <input
            type="text"
            value={newGroupDescription}
            onChange={(e) => setNewGroupDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full rounded-md border border-white/15 bg-background/50 px-2 py-1 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={newGroupExclusive}
              onChange={(e) => setNewGroupExclusive(e.target.checked)}
              className="h-3 w-3 rounded border-white/20 bg-background/50"
            />
            <Lock size={11} className="text-muted-foreground/50" />
            Exclusive (only one tag per entity)
          </label>
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
