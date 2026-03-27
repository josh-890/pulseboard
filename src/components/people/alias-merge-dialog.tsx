"use client";

import { useCallback, useState, useTransition } from "react";
import { useEscToClose } from "@/lib/hooks/use-esc-to-close";
import { Merge, X, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PersonAliasWithChannels } from "@/lib/services/alias-service";
import { mergeAliasesAction } from "@/lib/actions/alias-actions";

type AliasMergeDialogProps = {
  personId: string;
  aliases: PersonAliasWithChannels[];
  onClose: () => void;
};

export function AliasMergeDialog({ personId, aliases, onClose }: AliasMergeDialogProps) {
  const [isPending, startTransition] = useTransition();
  useEscToClose(onClose);
  const [targetId, setTargetId] = useState(aliases[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const sourceAliases = aliases.filter((a) => a.id !== targetId);
  const totalChannelLinks = sourceAliases.reduce((sum, a) => sum + a.channelLinks.length, 0);

  const handleMerge = useCallback(() => {
    if (!targetId || sourceAliases.length === 0) return;

    startTransition(async () => {
      setError(null);
      const result = await mergeAliasesAction(
        targetId,
        sourceAliases.map((a) => a.id),
        personId,
      );
      if (!result.success) {
        setError(result.error ?? "Merge failed.");
        return;
      }
      onClose();
    });
  }, [targetId, sourceAliases, personId, onClose]);

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-background p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Merge size={18} />
            Merge Aliases
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose the alias to keep. All channel links from the other aliases will be transferred to it,
            then the source aliases will be deleted.
          </p>

          {/* Target selection */}
          <div className="space-y-2">
            {aliases.map((alias) => (
              <button
                key={alias.id}
                type="button"
                onClick={() => setTargetId(alias.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
                  targetId === alias.id
                    ? "border-primary/40 bg-primary/10"
                    : "border-white/15 bg-card/50 hover:bg-card/70",
                )}
              >
                {/* Radio */}
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    targetId === alias.id
                      ? "border-primary"
                      : "border-white/20",
                  )}
                >
                  {targetId === alias.id && (
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <span className="font-medium">{alias.name}</span>
                  {alias.channelLinks.length > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Link2 size={10} />
                      {alias.channelLinks.length} channels
                    </span>
                  )}
                </div>

                {targetId === alias.id && (
                  <span className="shrink-0 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">
                    Keep
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Preview */}
          <div className="rounded-lg border border-white/10 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            {totalChannelLinks > 0 && (
              <p>{totalChannelLinks} channel {totalChannelLinks === 1 ? "link" : "links"} will be transferred</p>
            )}
            <p>{sourceAliases.length} {sourceAliases.length === 1 ? "alias" : "aliases"} will be deleted</p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm transition-colors hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleMerge}
              disabled={isPending || sourceAliases.length === 0}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Merging..." : "Merge"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
