"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getPersonChannelAliasesAction,
  pinCreditAliasAction,
  createAliasFromCreditAction,
  setCreditUsedNameAction,
} from "@/lib/actions/set-actions";

type ChannelAlias = { id: string; name: string; isCommon: boolean };

type CreditAliasPickerProps = {
  creditId: string;
  setId: string;
  personId: string;
  channelId: string | null;
  // The alias currently pinned to this credit (SetCreditRaw.resolvedAliasId), if any.
  currentAliasId: string | null;
  // The current "credited as" display value (null = credited under the common name).
  creditedAs: string | null;
};

// ADR-0024 — the per-set "Credited as" control, channel-aware:
//   (a) one alias on this channel  → shown as a suggestion chip to accept
//   (b) several                    → all shown, click to select
//   (c) none                       → add a new alias (added to the registry)
// A "New alias" affordance is always present (decline suggestions + add new),
// plus "use common name" to clear. Non-common channel aliases are the suggestions.
export function CreditAliasPicker({
  creditId,
  setId,
  personId,
  channelId,
  currentAliasId,
  creditedAs,
}: CreditAliasPickerProps) {
  const router = useRouter();
  // null = still loading; [] = no channel or none found.
  const [aliases, setAliases] = useState<ChannelAlias[] | null>(channelId ? null : []);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!channelId) return; // no channel to scope to; stays []
    let cancelled = false;
    getPersonChannelAliasesAction(personId, channelId)
      .then((a) => {
        if (!cancelled) setAliases(a);
      })
      .catch(() => {
        if (!cancelled) setAliases([]);
      });
    return () => {
      cancelled = true;
    };
  }, [personId, channelId]);

  async function run(fn: () => Promise<{ success: boolean; error?: string }>, okMsg?: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.success) {
      if (okMsg) toast.success(okMsg);
      router.refresh();
    } else {
      toast.error(res.error ?? "Failed");
    }
  }

  function createNew() {
    const n = newName.trim();
    if (!n) return;
    run(() => createAliasFromCreditAction(creditId, personId, n, channelId, setId), `Added alias “${n}”`).then(
      () => {
        setNewName("");
        setAdding(false);
      },
    );
  }

  // Options = every alias registered on this channel — INCLUDING the common name
  // when it's itself a channel alias, so the user can confirm "credited under the
  // common name on this channel" (ADR-0024). Common name first.
  const options = aliases ?? [];

  return (
    <div className="pl-2 flex flex-wrap items-center gap-1.5">
      <span className="shrink-0 text-[11px] text-muted-foreground">Credited as</span>

      {aliases === null ? (
        <Loader2 size={12} className="animate-spin text-muted-foreground" />
      ) : (
        <>
          {options.map((a) => {
            const selected = a.id === currentAliasId;
            return (
              <button
                key={a.id}
                type="button"
                disabled={busy}
                onClick={() => run(() => pinCreditAliasAction(creditId, a.id, setId), `Credited as ${a.name}`)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors disabled:opacity-50",
                  selected
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-white/15 bg-muted/40 text-foreground hover:border-white/30",
                )}
                title={
                  a.isCommon
                    ? "Common name — also this channel's alias"
                    : selected
                      ? "Currently credited as this"
                      : `Credit as ${a.name}`
                }
              >
                {selected && <Check size={10} />}
                {a.name}
                {a.isCommon && <span className="text-[9px] opacity-60">common</span>}
              </button>
            );
          })}

          {adding ? (
            <span className="inline-flex items-center gap-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    createNew();
                  }
                  if (e.key === "Escape") {
                    setAdding(false);
                    setNewName("");
                  }
                }}
                placeholder="New alias"
                disabled={busy}
                autoFocus
                className="h-6 w-32 text-xs"
              />
              <button
                type="button"
                disabled={busy || !newName.trim()}
                onClick={createNew}
                className="text-primary disabled:opacity-40"
                aria-label="Add alias"
              >
                <Check size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setNewName("");
                }}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Cancel"
              >
                <X size={14} />
              </button>
            </span>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-white/20 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-white/40 hover:text-foreground disabled:opacity-50"
            >
              <Plus size={10} /> New alias
            </button>
          )}

          {creditedAs && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => setCreditUsedNameAction(creditId, setId, ""))}
              className="text-[11px] text-muted-foreground/70 underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-50"
            >
              use common name
            </button>
          )}

          {busy && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
        </>
      )}
    </div>
  );
}
