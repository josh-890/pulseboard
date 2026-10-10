"use client";

import { useCallback, useState, useTransition } from "react";
import {
  GripVertical,
  ListTodo,
  Lock,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TagDomain, TagGroupKind, TagLevel } from "@/generated/prisma/client";
import type { TagGroupWithDefinitions } from "@/lib/services/tag-service";
import Link from "next/link";
import {
  createTagGroupAction,
  updateTagGroupAction,
  deleteTagGroupAction,
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

  return (
    <div className={cn("space-y-3", isPending && "opacity-70 pointer-events-none")}>
      {groups.map((group) => {
        const isEditing = editingGroupId === group.id;
        const hasTags = group.tags.length > 0;

        return (
          <div
            key={group.id}
            className="rounded-xl border border-white/15 bg-muted/20"
          >
            {/* Group header */}
            <div className="flex items-center gap-2 px-3 py-2.5">
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
                  <Link
                    href="/tags"
                    className="mr-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    title="Tags are created, renamed, moved, merged and deleted in /tags"
                  >
                    {group.tags.length} {group.tags.length === 1 ? "tag" : "tags"}
                  </Link>
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
