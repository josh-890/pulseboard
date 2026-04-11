"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  ArrowDownUp,
  BookUser,
  FileUp,
  Hash,
  Link2,
  Merge,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PersonAliasWithChannels } from "@/lib/services/alias-service";
import type { AliasSource } from "@/generated/prisma/client";
import {
  deleteAliasAction,
  unlinkAliasChannelAction,
  setAliasChannelPrimaryAction,
} from "@/lib/actions/alias-actions";
import { AddAliasSheet } from "./add-alias-sheet";
import { AliasImportDialog } from "./alias-import-dialog";
import { AliasMergeDialog } from "./alias-merge-dialog";
import { DigitalIdentitySection } from "./digital-identity-section";
import type { PersonDigitalIdentityItem } from "@/lib/types";

// ── Alias flag helpers ───────────────────────────────────────────────────────

function getAliasTagStyles(alias: { isCommon: boolean; isBirth: boolean }): string[] {
  const tags: string[] = [];
  if (alias.isCommon) tags.push("border-primary/30 bg-primary/10 text-primary");
  if (alias.isBirth) tags.push("border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400");
  if (!alias.isCommon && !alias.isBirth) tags.push("border-white/15 bg-muted/50 text-foreground");
  return tags;
}

function getAliasTagLabels(alias: { isCommon: boolean; isBirth: boolean }): string[] {
  const labels: string[] = [];
  if (alias.isCommon) labels.push("Common");
  if (alias.isBirth) labels.push("Birth");
  if (!alias.isCommon && !alias.isBirth) labels.push("Alias");
  return labels;
}

function getAliasNameColor(alias: { isCommon: boolean; isBirth: boolean }): string {
  if (alias.isCommon) return "text-primary font-semibold";
  if (alias.isBirth) return "text-amber-500 dark:text-amber-400";
  return "";
}

const SOURCE_LABELS: Record<AliasSource, string> = {
  MANUAL: "Manual",
  IMPORT: "Import",
};

// ── Types ───────────────────────────────────────────────────────────────────

type ViewMode = "by-alias" | "by-channel";
type SortMode = "default" | "links";

type PersonAliasesTabProps = {
  personId: string;
  aliases: PersonAliasWithChannels[];
  digitalIdentities: PersonDigitalIdentityItem[];
};

// ── Main Component ──────────────────────────────────────────────────────────

export function PersonAliasesTab({ personId, aliases, digitalIdentities }: PersonAliasesTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("by-alias");
  const [sortMode, setSortMode] = useState<SortMode>("links");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [editingAlias, setEditingAlias] = useState<PersonAliasWithChannels | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Filtered + sorted aliases
  const filteredAliases = useMemo(() => {
    let result = aliases;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.channelLinks.some((cl) => cl.channelName.toLowerCase().includes(q)),
      );
    }
    if (sortMode === "links") {
      result = [...result].sort((a, b) => b.channelLinks.length - a.channelLinks.length);
    }
    return result;
  }, [aliases, searchQuery, sortMode]);

  // Stats
  const totalAliases = aliases.length;
  const linkedCount = aliases.filter((a) => a.channelLinks.length > 0).length;
  const unlinkedCount = totalAliases - linkedCount;
  const channelCount = useMemo(() => {
    const channelIds = new Set<string>();
    for (const a of aliases) {
      for (const cl of a.channelLinks) channelIds.add(cl.channelId);
    }
    return channelIds.size;
  }, [aliases]);

  // By-channel grouping
  const byChannel = useMemo(() => {
    const map = new Map<string, { channelName: string; aliases: (PersonAliasWithChannels & { isPrimary: boolean })[] }>();
    const unlinked: PersonAliasWithChannels[] = [];

    for (const alias of filteredAliases) {
      if (alias.channelLinks.length === 0) {
        unlinked.push(alias);
      }
      for (const cl of alias.channelLinks) {
        const group = map.get(cl.channelId) ?? { channelName: cl.channelName, aliases: [] };
        group.aliases.push({ ...alias, isPrimary: cl.isPrimary });
        map.set(cl.channelId, group);
      }
    }

    return {
      channels: Array.from(map.entries()).sort((a, b) => a[1].channelName.localeCompare(b[1].channelName)),
      unlinked,
    };
  }, [filteredAliases]);

  // Selection
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const selectedAliases = useMemo(
    () => aliases.filter((a) => selectedIds.has(a.id)),
    [aliases, selectedIds],
  );

  // Delete
  const handleDelete = useCallback(
    (aliasId: string) => {
      startTransition(async () => {
        await deleteAliasAction(aliasId, personId);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(aliasId);
          return next;
        });
      });
    },
    [personId],
  );

  const handleBulkDelete = useCallback(() => {
    startTransition(async () => {
      for (const id of selectedIds) {
        await deleteAliasAction(id, personId);
      }
      setSelectedIds(new Set());
    });
  }, [selectedIds, personId]);

  // Unlink
  const handleUnlink = useCallback(
    (aliasId: string, channelId: string) => {
      startTransition(async () => {
        await unlinkAliasChannelAction(aliasId, personId, channelId);
      });
    },
    [personId],
  );

  // Toggle primary
  const handleTogglePrimary = useCallback(
    (aliasId: string, channelId: string, current: boolean) => {
      startTransition(async () => {
        await setAliasChannelPrimaryAction(aliasId, personId, channelId, !current);
      });
    },
    [personId],
  );

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <BookUser size={14} />
            {totalAliases} {totalAliases === 1 ? "alias" : "aliases"}
          </span>
          <span className="flex items-center gap-1.5">
            <Link2 size={14} />
            {channelCount} {channelCount === 1 ? "channel" : "channels"}
          </span>
          {unlinkedCount > 0 && (
            <span className="text-amber-500">{unlinkedCount} unlinked</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setImportDialogOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-card/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            <FileUp size={14} />
            Bulk Import
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingAlias(null);
              setAddSheetOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus size={14} />
            Add Alias
          </button>
        </div>
      </div>

      {/* Search + view toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search aliases or channels..."
            className="h-9 w-full rounded-lg border border-white/15 bg-card/50 pl-9 pr-3 text-sm placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Sort toggle — only in by-alias view */}
        {viewMode === "by-alias" && (
          <button
            type="button"
            onClick={() => setSortMode((s) => s === "default" ? "links" : "default")}
            title={sortMode === "default" ? "Sorted A–Z — click to sort by links" : "Sort A–Z"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
              sortMode === "default"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-white/15 bg-card/50 text-muted-foreground hover:text-foreground",
            )}
          >
            <ArrowDownUp size={13} />
            A–Z
          </button>
        )}

        {/* View toggle */}
        <div className="flex rounded-lg border border-white/15 bg-card/50 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("by-alias")}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-all",
              viewMode === "by-alias"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            By Alias
          </button>
          <button
            type="button"
            onClick={() => setViewMode("by-channel")}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-all",
              viewMode === "by-channel"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            By Channel
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === "by-alias" ? (
        <ByAliasView
          aliases={filteredAliases}
          selectedIds={selectedIds}
          isPending={isPending}
          onToggleSelect={toggleSelect}
          onEdit={(a) => { setEditingAlias(a); setAddSheetOpen(true); }}
          onDelete={handleDelete}
          onUnlink={handleUnlink}
          onTogglePrimary={handleTogglePrimary}
        />
      ) : (
        <ByChannelView
          channels={byChannel.channels}
          unlinked={byChannel.unlinked}
          isPending={isPending}
          onEdit={(a) => { setEditingAlias(a); setAddSheetOpen(true); }}
          onDelete={handleDelete}
          onUnlink={handleUnlink}
          onTogglePrimary={handleTogglePrimary}
        />
      )}

      {/* Empty state */}
      {filteredAliases.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-card/50 py-12 text-center">
          <BookUser size={32} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground/70">
            {searchQuery ? "No aliases match your search." : "No aliases yet."}
          </p>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-white/20 bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur-md">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          {selectedIds.size >= 2 && (
            <button
              type="button"
              onClick={() => setMergeDialogOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm transition-colors hover:bg-muted"
            >
              <Merge size={14} />
              Merge
            </button>
          )}
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-500 transition-colors hover:bg-red-500/20"
          >
            <Trash2 size={14} />
            Delete
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="ml-1 text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Digital Identities */}
      <DigitalIdentitySection personId={personId} identities={digitalIdentities} />

      {/* Sheets/Dialogs */}
      {addSheetOpen && (
        <AddAliasSheet
          personId={personId}
          editingAlias={editingAlias}
          existingAliases={aliases}
          onClose={() => { setAddSheetOpen(false); setEditingAlias(null); }}
        />
      )}
      {importDialogOpen && (
        <AliasImportDialog
          personId={personId}
          onClose={() => setImportDialogOpen(false)}
        />
      )}
      {mergeDialogOpen && selectedAliases.length >= 2 && (
        <AliasMergeDialog
          personId={personId}
          aliases={selectedAliases}
          onClose={() => { setMergeDialogOpen(false); clearSelection(); }}
        />
      )}
    </div>
  );
}

// ── By Alias View ───────────────────────────────────────────────────────────

// ── Channel chip sub-component ───────────────────────────────────────────────

function ChannelChip({
  aliasId,
  cl,
  isPending,
  onUnlink,
  onTogglePrimary,
}: {
  aliasId: string;
  cl: PersonAliasWithChannels["channelLinks"][number];
  isPending: boolean;
  onUnlink: (aliasId: string, channelId: string) => void;
  onTogglePrimary: (aliasId: string, channelId: string, current: boolean) => void;
}) {
  const tooltip = cl.labelNames.length > 0 ? cl.labelNames.join(", ") : undefined;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
        cl.isPrimary
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20",
      )}
      title={tooltip}
    >
      {/* Star — visual-only for primary, promote action for others */}
      <button
        type="button"
        onClick={cl.isPrimary ? undefined : () => onTogglePrimary(aliasId, cl.channelId, cl.isPrimary)}
        className={cn(
          "shrink-0 transition-colors",
          cl.isPrimary
            ? "cursor-default text-amber-400"
            : "cursor-pointer text-muted-foreground/30 hover:text-amber-400",
        )}
        title={cl.isPrimary ? "Primary channel" : "Set as primary"}
        tabIndex={cl.isPrimary ? -1 : 0}
      >
        <Star size={10} fill={cl.isPrimary ? "currentColor" : "none"} />
      </button>

      <span className="max-w-[160px] truncate">{cl.channelName}</span>

      {/* Unlink */}
      <button
        type="button"
        onClick={() => onUnlink(aliasId, cl.channelId)}
        disabled={isPending}
        className="shrink-0 text-muted-foreground/40 transition-colors hover:text-red-400"
        title="Unlink channel"
      >
        <X size={10} />
      </button>
    </span>
  );
}

// ── By Alias View ────────────────────────────────────────────────────────────

function ByAliasView({
  aliases,
  selectedIds,
  isPending,
  onToggleSelect,
  onEdit,
  onDelete,
  onUnlink,
  onTogglePrimary,
}: {
  aliases: PersonAliasWithChannels[];
  selectedIds: Set<string>;
  isPending: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (alias: PersonAliasWithChannels) => void;
  onDelete: (id: string) => void;
  onUnlink: (aliasId: string, channelId: string) => void;
  onTogglePrimary: (aliasId: string, channelId: string, current: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      {aliases.map((alias) => {
        const isSelected = selectedIds.has(alias.id);

        // Sort: primary first, then alphabetical
        const sortedLinks = [...alias.channelLinks].sort((a, b) => {
          if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
          return a.channelName.localeCompare(b.channelName);
        });

        return (
          <div
            key={alias.id}
            className={cn(
              "rounded-xl border border-white/15 bg-card/60 transition-all",
              isSelected && "border-primary/40 bg-primary/5",
            )}
          >
            {/* Card header */}
            <div className="flex items-center gap-3 px-4 py-3">
              {/* Checkbox */}
              <button
                type="button"
                onClick={() => onToggleSelect(alias.id)}
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-white/20 hover:border-white/40",
                )}
              >
                {isSelected && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>

              {/* Name */}
              <span className={cn("min-w-0 flex-1 truncate font-medium", getAliasNameColor(alias))}>{alias.name}</span>

              {/* Type pills */}
              <span className="flex shrink-0 gap-1">
                {getAliasTagLabels(alias).map((label, i) => (
                  <span
                    key={label}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                      getAliasTagStyles(alias)[i],
                    )}
                  >
                    {label}
                  </span>
                ))}
              </span>

              {/* Source pill */}
              <span className="shrink-0 rounded-full border border-white/10 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
                {SOURCE_LABELS[alias.source]}
              </span>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(alias)}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Edit alias"
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(alias.id)}
                  disabled={isPending}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                  title="Delete alias"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Notes */}
            {alias.notes && (
              <div className="px-4 pb-2 text-xs text-muted-foreground italic">{alias.notes}</div>
            )}

            {/* Channel chips — always visible, wrap freely */}
            <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 pt-0">
              {sortedLinks.map((cl) => (
                <ChannelChip
                  key={cl.channelId}
                  aliasId={alias.id}
                  cl={cl}
                  isPending={isPending}
                  onUnlink={onUnlink}
                  onTogglePrimary={onTogglePrimary}
                />
              ))}
              {/* + link CTA */}
              <button
                type="button"
                onClick={() => onEdit(alias)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/20 px-2 py-0.5 text-xs text-muted-foreground/50 transition-colors hover:border-white/40 hover:text-muted-foreground"
                title="Link to a channel"
              >
                <Plus size={10} />
                link
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Alias chip (used in By Channel view) ─────────────────────────────────────

function AliasChip({
  alias,
  channelId,
  isPending,
  onEdit,
  onUnlink,
  onTogglePrimary,
}: {
  alias: PersonAliasWithChannels & { isPrimary: boolean };
  channelId: string;
  isPending: boolean;
  onEdit: (alias: PersonAliasWithChannels) => void;
  onUnlink: (aliasId: string, channelId: string) => void;
  onTogglePrimary: (aliasId: string, channelId: string, current: boolean) => void;
}) {
  const typeLabel = getAliasTagLabels(alias)[0];
  const typeStyle = getAliasTagStyles(alias)[0];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
        alias.isPrimary
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-white/10 bg-white/5 text-muted-foreground hover:border-white/20",
      )}
      title={typeLabel}
    >
      {/* Star — visual-only for primary, promote for others */}
      <button
        type="button"
        onClick={alias.isPrimary ? undefined : () => onTogglePrimary(alias.id, channelId, alias.isPrimary)}
        className={cn(
          "shrink-0 transition-colors",
          alias.isPrimary
            ? "cursor-default text-amber-400"
            : "cursor-pointer text-muted-foreground/30 hover:text-amber-400",
        )}
        title={alias.isPrimary ? "Primary alias" : "Set as primary"}
        tabIndex={alias.isPrimary ? -1 : 0}
      >
        <Star size={10} fill={alias.isPrimary ? "currentColor" : "none"} />
      </button>

      <span className={cn("max-w-[140px] truncate", getAliasNameColor(alias))}>{alias.name}</span>

      {/* Type badge — only for Common and Birth, not plain Alias */}
      {(alias.isCommon || alias.isBirth) && (
        <span className={cn("rounded-full border px-1.5 py-0 text-[9px] font-medium leading-4", typeStyle)}>
          {typeLabel}
        </span>
      )}

      {/* Edit */}
      <button
        type="button"
        onClick={() => onEdit(alias)}
        className="shrink-0 text-muted-foreground/40 transition-colors hover:text-foreground"
        title="Edit alias"
      >
        <Pencil size={9} />
      </button>

      {/* Unlink */}
      <button
        type="button"
        onClick={() => onUnlink(alias.id, channelId)}
        disabled={isPending}
        className="shrink-0 text-muted-foreground/40 transition-colors hover:text-red-400"
        title="Unlink from channel"
      >
        <X size={10} />
      </button>
    </span>
  );
}

// ── By Channel View ─────────────────────────────────────────────────────────

function ByChannelView({
  channels,
  unlinked,
  isPending,
  onEdit,
  onDelete,
  onUnlink,
  onTogglePrimary,
}: {
  channels: [string, { channelName: string; aliases: (PersonAliasWithChannels & { isPrimary: boolean })[] }][];
  unlinked: PersonAliasWithChannels[];
  isPending: boolean;
  onEdit: (alias: PersonAliasWithChannels) => void;
  onDelete: (id: string) => void;
  onUnlink: (aliasId: string, channelId: string) => void;
  onTogglePrimary: (aliasId: string, channelId: string, current: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      {/* Unlinked group — shown first */}
      {unlinked.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center gap-2 px-4 py-3">
            <span className="flex-1 font-medium text-amber-600 dark:text-amber-400">Unlinked</span>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
              {unlinked.length}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 pt-0">
            {unlinked.map((alias) => {
              const typeLabel = getAliasTagLabels(alias)[0];
              const typeStyle = getAliasTagStyles(alias)[0];
              return (
                <span
                  key={alias.id}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-muted-foreground"
                >
                  <span className={cn("max-w-[140px] truncate", getAliasNameColor(alias))}>{alias.name}</span>
                  {(alias.isCommon || alias.isBirth) && (
                    <span className={cn("rounded-full border px-1.5 py-0 text-[9px] font-medium leading-4", typeStyle)}>
                      {typeLabel}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onEdit(alias)}
                    className="shrink-0 text-muted-foreground/40 transition-colors hover:text-foreground"
                    title="Edit alias"
                  >
                    <Pencil size={9} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(alias.id)}
                    disabled={isPending}
                    className="shrink-0 text-muted-foreground/40 transition-colors hover:text-red-400"
                    title="Delete alias"
                  >
                    <X size={10} />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Channel groups */}
      {channels.map(([channelId, group]) => {
        const sortedAliases = [...group.aliases].sort((a, b) => {
          if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        return (
          <div key={channelId} className="rounded-xl border border-white/15 bg-card/60">
            {/* Channel header */}
            <div className="flex items-center gap-2 px-4 py-3">
              <Hash size={14} className="shrink-0 text-muted-foreground" />
              <span className="flex-1 font-medium">{group.channelName}</span>
              <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                {group.aliases.length}
              </span>
            </div>

            {/* Alias chips — always visible, wrap freely */}
            <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 pt-0">
              {sortedAliases.map((alias) => (
                <AliasChip
                  key={alias.id}
                  alias={alias}
                  channelId={channelId}
                  isPending={isPending}
                  onEdit={onEdit}
                  onUnlink={onUnlink}
                  onTogglePrimary={onTogglePrimary}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
