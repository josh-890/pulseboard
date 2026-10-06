"use client";

import { useCallback, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  ListTodo,
  Lock,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TagDomain, TagGroupKind, TagLevel } from "@/generated/prisma/client";
import type { TagGroupWithDefinitions } from "@/lib/services/tag-service";
import { TagNameClashHint } from "@/components/tags/tag-name-clash-hint";
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

type GroupFields = {
  domain: TagDomain;
  typicalLevel: TagLevel | null;
  kind: TagGroupKind;
};

const DEFAULT_GROUP_FIELDS: GroupFields = { domain: "ANY", typicalLevel: null, kind: "DESCRIPTIVE" };

const DOMAIN_OPTIONS: { value: TagDomain; label: string }[] = [
  { value: "CONTENT", label: "Content (session · set · image)" },
  { value: "PERSON", label: "Person" },
  { value: "PROJECT", label: "Project" },
  { value: "ANY", label: "Any" },
];

const LEVEL_OPTIONS: { value: TagLevel; label: string }[] = [
  { value: "SESSION", label: "Session" },
  { value: "SET", label: "Set" },
  { value: "MEDIA_ITEM", label: "Image" },
];

const DOMAIN_SHORT: Record<TagDomain, string> = {
  CONTENT: "Content",
  PERSON: "Person",
  PROJECT: "Project",
  ANY: "Any",
};

const LEVEL_SHORT: Record<TagLevel, string> = { SESSION: "session", SET: "set", MEDIA_ITEM: "image" };

const SELECT_CLASS =
  "rounded-md border border-white/15 bg-background/50 px-1.5 py-1 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

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

function GroupFieldsEditor({
  value,
  onChange,
}: {
  value: GroupFields;
  onChange: (value: GroupFields) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <label className="flex items-center gap-1">
        Domain
        <select
          value={value.domain}
          onChange={(e) => {
            const domain = e.target.value as TagDomain;
            // A typical level only means something inside the content chain
            onChange({ ...value, domain, typicalLevel: domain === "CONTENT" ? value.typicalLevel : null });
          }}
          className={SELECT_CLASS}
        >
          {DOMAIN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      {value.domain === "CONTENT" && (
        <label className="flex items-center gap-1">
          Typical level
          <select
            value={value.typicalLevel ?? ""}
            onChange={(e) => onChange({ ...value, typicalLevel: (e.target.value || null) as TagLevel | null })}
            className={SELECT_CLASS}
          >
            <option value="">—</option>
            {LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      )}
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={value.kind === "WORKFLOW"}
          onChange={(e) => onChange({ ...value, kind: e.target.checked ? "WORKFLOW" : "DESCRIPTIVE" })}
          className="h-3 w-3 rounded border-white/20 bg-background/50"
        />
        <ListTodo size={11} className="text-muted-foreground/50" />
        Workflow markers (never inherited)
      </label>
    </div>
  );
}

function GroupFieldBadges({ group }: { group: GroupFields }) {
  return (
    <span className="flex items-center gap-1">
      <span className="rounded bg-primary/15 px-1 py-0.5 text-[9px] font-medium leading-none text-primary">
        {DOMAIN_SHORT[group.domain]}
        {group.typicalLevel ? ` · ${LEVEL_SHORT[group.typicalLevel]}` : ""}
      </span>
      {group.kind === "WORKFLOW" && (
        <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-medium leading-none text-amber-600 dark:text-amber-400">
          workflow
        </span>
      )}
    </span>
  );
}

function TagStructureFields({
  tagId,
  group,
  parentId,
  typicalLevel,
  onChange,
}: {
  tagId: string | null;
  group: TagGroupWithDefinitions;
  parentId: string | null;
  typicalLevel: TagLevel | null;
  onChange: (value: { parentId: string | null; typicalLevel: TagLevel | null }) => void;
}) {
  // A tag can only be parented within its own group; the server rejects cycles
  const candidates = group.tags.filter((t) => t.id !== tagId);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <label className="flex items-center gap-1">
        Parent
        <select
          value={parentId ?? ""}
          onChange={(e) => onChange({ parentId: e.target.value || null, typicalLevel })}
          className={SELECT_CLASS}
        >
          <option value="">— none —</option>
          {candidates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>
      {group.domain === "CONTENT" && (
        <label className="flex items-center gap-1">
          Level
          <select
            value={typicalLevel ?? ""}
            onChange={(e) => onChange({ parentId, typicalLevel: (e.target.value || null) as TagLevel | null })}
            className={SELECT_CLASS}
          >
            <option value="">
              {group.typicalLevel ? `group default (${LEVEL_SHORT[group.typicalLevel]})` : "group default"}
            </option>
            {LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      )}
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
  const [newGroupFields, setNewGroupFields] = useState<GroupFields>(DEFAULT_GROUP_FIELDS);

  // ── Edit group ──
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupColor, setEditGroupColor] = useState("");
  const [editGroupDescription, setEditGroupDescription] = useState("");
  const [editGroupExclusive, setEditGroupExclusive] = useState(false);
  const [editGroupFields, setEditGroupFields] = useState<GroupFields>(DEFAULT_GROUP_FIELDS);

  // ── Add tag ──
  const [addingTagGroupId, setAddingTagGroupId] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagStructure, setNewTagStructure] = useState<{ parentId: string | null; typicalLevel: TagLevel | null }>(
    { parentId: null, typicalLevel: null },
  );
  const [newTagDescription, setNewTagDescription] = useState("");

  // ── Edit tag ──
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editTagName, setEditTagName] = useState("");
  const [editTagStructure, setEditTagStructure] = useState<{ parentId: string | null; typicalLevel: TagLevel | null }>(
    { parentId: null, typicalLevel: null },
  );
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
    const fields = newGroupFields;
    startTransition(async () => {
      const result = await createTagGroupAction({ name, color, description, isExclusive, ...fields });
      if (result.success) {
        setNewGroupName("");
        setNewGroupColor("#6b7280");
        setNewGroupDescription("");
        setNewGroupExclusive(false);
        setNewGroupFields(DEFAULT_GROUP_FIELDS);
        setShowAddGroup(false);
        window.location.reload();
      }
    });
  }, [newGroupName, newGroupColor, newGroupDescription, newGroupExclusive, newGroupFields]);

  const handleUpdateGroup = useCallback(
    (id: string) => {
      if (!editGroupName.trim()) return;
      startTransition(async () => {
        await updateTagGroupAction(id, {
          name: editGroupName.trim(),
          color: editGroupColor,
          description: editGroupDescription.trim() || null,
          isExclusive: editGroupExclusive,
          ...editGroupFields,
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
                  ...editGroupFields,
                }
              : g,
          ),
        );
        setEditingGroupId(null);
      });
    },
    [editGroupName, editGroupColor, editGroupDescription, editGroupExclusive, editGroupFields],
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
      const structure = newTagStructure;
      const description = newTagDescription.trim() || undefined;
      startTransition(async () => {
        const result = await createTagDefinitionAction({ groupId, name, description, ...structure });
        if (result.success) {
          setNewTagName("");
          setNewTagStructure({ parentId: null, typicalLevel: null });
          setNewTagDescription("");
          setAddingTagGroupId(null);
          window.location.reload();
        }
      });
    },
    [newTagName, newTagStructure, newTagDescription],
  );

  const handleUpdateTag = useCallback(
    (id: string) => {
      if (!editTagName.trim()) return;
      startTransition(async () => {
        const result = await updateTagDefinitionAction(id, {
          name: editTagName.trim(),
          ...editTagStructure,
          description: editTagDescription.trim() || null,
        });
        if (!result.success) {
          toast.error(result.error ?? "Failed to update tag");
          return;
        }
        setGroups((prev) =>
          prev.map((g) => ({
            ...g,
            tags: g.tags.map((t) =>
              t.id === id
                ? { ...t, name: editTagName.trim(), ...editTagStructure, description: editTagDescription.trim() || null }
                : t,
            ),
          })),
        );
        setEditingTagId(null);
      });
    },
    [editTagName, editTagStructure, editTagDescription],
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
                  <GroupFieldsEditor value={editGroupFields} onChange={setEditGroupFields} />
                </div>
              ) : (
                <>
                  <span className="flex items-center gap-1.5 flex-1 text-sm font-semibold">
                    {group.name}
                    {group.isExclusive && (
                      <span title="Exclusive group"><Lock size={11} className="text-muted-foreground/50" /></span>
                    )}
                  </span>
                  {group.description && (
                    <span className="mr-1 hidden text-xs text-muted-foreground/60 md:inline">
                      {group.description}
                    </span>
                  )}
                  <GroupFieldBadges group={group} />
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
                      setEditGroupFields({
                        domain: group.domain,
                        typicalLevel: group.typicalLevel,
                        kind: group.kind,
                      });
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
                        <TagNameClashHint
                          name={editTagName}
                          groupName={group.name}
                          excludeId={tag.id}
                          onUseSuggestion={setEditTagName}
                        />
                        <TagStructureFields
                          tagId={tag.id}
                          group={group}
                          parentId={editTagStructure.parentId}
                          typicalLevel={editTagStructure.typicalLevel}
                          onChange={setEditTagStructure}
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
                          {tag.parentId && (
                            <span className="text-[10px] text-muted-foreground/50">
                              ⊂ {group.tags.find((t) => t.id === tag.parentId)?.name}
                            </span>
                          )}
                          {tag.typicalLevel && (
                            <span className="rounded bg-muted/40 px-1 py-0.5 text-[9px] leading-none text-muted-foreground">
                              {LEVEL_SHORT[tag.typicalLevel]}
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
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTagId(tag.id);
                          setEditTagName(tag.name);
                          setEditTagStructure({ parentId: tag.parentId, typicalLevel: tag.typicalLevel });
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
                          setNewTagStructure({ parentId: null, typicalLevel: null });
                          setNewTagDescription("");
                        }}
                        className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <TagNameClashHint name={newTagName} groupName={group.name} onUseSuggestion={setNewTagName} />
                    <TagStructureFields
                      tagId={null}
                      group={group}
                      parentId={newTagStructure.parentId}
                      typicalLevel={newTagStructure.typicalLevel}
                      onChange={setNewTagStructure}
                    />
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
                setNewGroupFields(DEFAULT_GROUP_FIELDS);
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
          <GroupFieldsEditor value={newGroupFields} onChange={setNewGroupFields} />
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
