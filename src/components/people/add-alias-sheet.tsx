"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { X, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AliasType } from "@/generated/prisma/client";
import type { PersonAliasWithChannels } from "@/lib/services/alias-service";
import {
  createAliasAction,
  updateAliasAction,
  linkAliasChannelsAction,
} from "@/lib/actions/alias-actions";

type ChannelOption = { id: string; name: string };

type AddAliasSheetProps = {
  personId: string;
  editingAlias?: PersonAliasWithChannels | null;
  onClose: () => void;
};

export function AddAliasSheet({
  personId,
  editingAlias,
  onClose,
}: AddAliasSheetProps) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(editingAlias?.name ?? "");
  const [type, setType] = useState<AliasType>(editingAlias?.type ?? "alias");
  const [notes, setNotes] = useState(editingAlias?.notes ?? "");
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [channelSearch, setChannelSearch] = useState("");
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(
    new Set(editingAlias?.channelLinks.map((cl) => cl.channelId) ?? []),
  );
  const [error, setError] = useState<string | null>(null);

  // Load channels on mount
  useEffect(() => {
    fetch("/api/channels/search")
      .then((r) => r.json())
      .then((data: ChannelOption[]) => setChannels(data))
      .catch(() => {});
  }, []);

  const filteredChannels = channelSearch.trim()
    ? channels.filter((c) => c.name.toLowerCase().includes(channelSearch.toLowerCase()))
    : channels;

  const toggleChannel = useCallback((id: string) => {
    setSelectedChannelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    startTransition(async () => {
      setError(null);
      if (editingAlias) {
        const result = await updateAliasAction(editingAlias.id, personId, {
          name: name.trim(),
          type,
          notes: notes.trim() || null,
        });
        if (!result.success) {
          setError(result.error ?? "Failed to update alias.");
          return;
        }
        // Sync channel links: add new ones (removals handled via unlink in the tab)
        const existingChannelIds = new Set(editingAlias.channelLinks.map((cl) => cl.channelId));
        const newChannelIds = [...selectedChannelIds].filter((id) => !existingChannelIds.has(id));
        if (newChannelIds.length > 0) {
          await linkAliasChannelsAction(editingAlias.id, personId, newChannelIds);
        }
      } else {
        const result = await createAliasAction(personId, {
          name: name.trim(),
          type,
          notes: notes.trim() || null,
          channelIds: [...selectedChannelIds],
        });
        if (!result.success) {
          setError(result.error ?? "Failed to create alias.");
          return;
        }
      }
      onClose();
    });
  }, [editingAlias, name, type, notes, selectedChannelIds, personId, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md bg-background border-l border-white/15 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/15 bg-background px-6 py-4">
          <h2 className="text-lg font-semibold">
            {editingAlias ? "Edit Alias" : "Add Alias"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter alias name..."
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>

          {/* Type */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AliasType)}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="alias">Alias</option>
              <option value="common">Common</option>
              <option value="birth">Birth</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              rows={3}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {/* Channel multi-select */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Channels
              {selectedChannelIds.size > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({selectedChannelIds.size} selected)
                </span>
              )}
            </label>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={channelSearch}
                onChange={(e) => setChannelSearch(e.target.value)}
                placeholder="Search channels..."
                className="w-full rounded-lg border border-white/15 bg-muted/30 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-muted/20">
              {filteredChannels.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">No channels found.</p>
              ) : (
                filteredChannels.map((ch) => {
                  const isSelected = selectedChannelIds.has(ch.id);
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => toggleChannel(ch.id)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-muted/40",
                        isSelected && "bg-primary/10",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-white/20",
                        )}
                      >
                        {isSelected && (
                          <svg width="8" height="6" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <span className="truncate">{ch.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !name.trim()}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Saving..." : editingAlias ? "Update Alias" : "Create Alias"}
          </button>
        </div>
      </div>
    </div>
  );
}
