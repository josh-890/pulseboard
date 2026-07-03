"use client";

import { useState, useTransition } from "react";
import { Sparkles, Check, X } from "lucide-react";
import { toast } from "sonner";
import type { AliasPromotionCandidate } from "@/lib/services/alias-service";
import {
  promoteAliasFromQueueAction,
  dismissAliasPromotionAction,
} from "@/lib/actions/alias-actions";

type AliasPromotionSuggestionsProps = {
  personId: string;
  candidates: AliasPromotionCandidate[];
};

// ADR-0024 — Moment 2: promote a used-name seen in sets into a registered,
// channel-scoped alias. Each candidate is corroborated by a set count. Confirm
// creates the alias + channel link + back-fills pins; dismiss records a marker.
export function AliasPromotionSuggestions({ personId, candidates }: AliasPromotionSuggestionsProps) {
  // Locally hide rows the user has just acted on (the server revalidate follows).
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const visible = candidates.filter((c) => !handled.has(keyOf(c)));
  if (visible.length === 0) return null;

  function markHandled(c: AliasPromotionCandidate) {
    setHandled((prev) => new Set(prev).add(keyOf(c)));
  }

  function promote(c: AliasPromotionCandidate) {
    startTransition(async () => {
      const res = await promoteAliasFromQueueAction(personId, c.channelId, c.name);
      if (res.success) {
        markHandled(c);
        toast.success(`Added "${c.name}" as an alias on ${c.channelName}.`);
      } else {
        toast.error(res.error ?? "Could not add alias.");
      }
    });
  }

  function dismiss(c: AliasPromotionCandidate) {
    startTransition(async () => {
      const res = await dismissAliasPromotionAction(personId, c.channelId, c.name);
      if (res.success) markHandled(c);
      else toast.error(res.error ?? "Could not dismiss.");
    });
  }

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] p-3">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-violet-700 dark:text-violet-300">
        <Sparkles size={14} />
        Suggested from sets ({visible.length})
      </div>
      <ul className="space-y-1.5">
        {visible.map((c) => (
          <li
            key={keyOf(c)}
            className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-card/50 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <span className="font-medium">{c.name}</span>
              <span className="ml-1.5 text-xs text-muted-foreground">
                on {c.channelName} · {c.setCount} {c.setCount === 1 ? "set" : "sets"}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                disabled={isPending}
                onClick={() => promote(c)}
                className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-500/20 disabled:opacity-50 dark:text-violet-300"
              >
                <Check size={12} /> Add alias
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => dismiss(c)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
                aria-label={`Dismiss ${c.name}`}
              >
                <X size={12} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function keyOf(c: AliasPromotionCandidate): string {
  return `${c.channelId}|${c.nameNorm}`;
}
