"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useEscToClose } from "@/lib/hooks/use-esc-to-close";
import { X, Search, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
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
  /** All aliases for this person — used to detect existing common/birth conflicts */
  existingAliases?: PersonAliasWithChannels[];
  onClose: () => void;
};

export function AddAliasSheet({
  personId,
  editingAlias,
  existingAliases = [],
  onClose,
}: AddAliasSheetProps) {
  const [isPending, startTransition] = useTransition();
  useEscToClose(onClose);
  const [name, setName] = useState(editingAlias?.name ?? "");
  const [isCommon, setIsCommon] = useState(editingAlias?.isCommon ?? false);
  const [isBirth, setIsBirth] = useState(editingAlias?.isBirth ?? false);
  const [notes, setNotes] = useState(editingAlias?.notes ?? "");
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [channelSearch, setChannelSearch] = useState("");
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(
    new Set(editingAlias?.channelLinks.map((cl) => cl.channelId) ?? []),
  );
  const [error, setError] = useState<string | null>(null);

  // Confirmation dialog state
  const [pendingConfirm, setPendingConfirm] = useState<{
    type: "common" | "birth";
    conflictName: string;
  } | null>(null);

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

  // Find existing common/birth aliases (excluding the one being edited)
  const existingCommon = existingAliases.find(
    (a) => a.isCommon && a.id !== editingAlias?.id,
  );
  const existingBirth = existingAliases.find(
    (a) => a.isBirth && a.id !== editingAlias?.id,
  );

  const handleToggleCommon = useCallback((checked: boolean) => {
    if (checked && existingCommon) {
      setPendingConfirm({ type: "common", conflictName: existingCommon.name });
    } else {
      setIsCommon(checked);
    }
  }, [existingCommon]);

  const handleToggleBirth = useCallback((checked: boolean) => {
    if (checked && existingBirth) {
      setPendingConfirm({ type: "birth", conflictName: existingBirth.name });
    } else {
      setIsBirth(checked);
    }
  }, [existingBirth]);

  const confirmPending = useCallback(() => {
    if (pendingConfirm?.type === "common") setIsCommon(true);
    if (pendingConfirm?.type === "birth") setIsBirth(true);
    setPendingConfirm(null);
  }, [pendingConfirm]);

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
          isCommon,
          isBirth,
          notes: notes.trim() || null,
        });
        if (!result.success) {
          setError(result.error ?? "Failed to update alias.");
          return;
        }
        const existingChannelIds = new Set(editingAlias.channelLinks.map((cl) => cl.channelId));
        const newChannelIds = [...selectedChannelIds].filter((id) => !existingChannelIds.has(id));
        if (newChannelIds.length > 0) {
          await linkAliasChannelsAction(editingAlias.id, personId, newChannelIds);
        }
      } else {
        const result = await createAliasAction(personId, {
          name: name.trim(),
          isCommon,
          isBirth,
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
  }, [editingAlias, name, isCommon, isBirth, notes, selectedChannelIds, personId, onClose]);

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex justify-end">
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

          {/* Flags */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Tags</label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-muted/20 px-3 py-2.5 hover:bg-muted/30 transition-colors">
              <input
                type="checkbox"
                checked={isCommon}
                onChange={(e) => handleToggleCommon(e.target.checked)}
                className="mt-0.5 accent-primary"
              />
              <div>
                <span className="text-sm font-medium">Common name</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The name this person is listed under in the database
                </p>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-muted/20 px-3 py-2.5 hover:bg-muted/30 transition-colors">
              <input
                type="checkbox"
                checked={isBirth}
                onChange={(e) => handleToggleBirth(e.target.checked)}
                className="mt-0.5 accent-amber-500"
              />
              <div>
                <span className="text-sm font-medium">Birth name</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The name this person was given at birth
                </p>
              </div>
            </label>
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

      {/* Confirmation dialog */}
      {pendingConfirm && (
        <div className="absolute inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setPendingConfirm(null)} />
          <div className="relative w-full max-w-sm rounded-xl border border-white/15 bg-background p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-medium">
                  {pendingConfirm.type === "common"
                    ? "Change common name?"
                    : "Transfer birth name?"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {pendingConfirm.type === "common"
                    ? <>
                        <span className="font-medium text-foreground">{pendingConfirm.conflictName}</span>
                        {" "}is currently the common name. It will become a plain alias.
                      </>
                    : <>
                        <span className="font-medium text-foreground">{pendingConfirm.conflictName}</span>
                        {" "}is currently tagged as the birth name. That tag will be removed from it.
                      </>}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm hover:bg-muted/40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPending}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
