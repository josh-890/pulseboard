"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addArtistAliasAction, removeArtistAliasAction } from "@/lib/actions/artist-actions";

type ArtistAliasesProps = {
  artistId: string;
  aliases: { id: string; alias: string }[];
};

/**
 * The other names they are credited under. A credit with exactly one of these
 * names (and no other artist's) links to them by itself — now and on import.
 */
export function ArtistAliases({ artistId, aliases }: ArtistAliasesProps) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [isPending, start] = useTransition();

  function add() {
    const alias = draft.trim();
    if (!alias) return;
    start(async () => {
      const res = await addArtistAliasAction(artistId, alias);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setDraft("");
      toast.success(res.linked > 0 ? `Alias added · ${res.linked} credit${res.linked === 1 ? "" : "s"} linked` : "Alias added");
      router.refresh();
    });
  }

  function remove(aliasId: string) {
    start(async () => {
      const res = await removeArtistAliasAction(artistId, aliasId);
      if (!res.success) {
        toast.error(res.error ?? "Could not remove the alias");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {aliases.length === 0 ? (
        <p className="text-sm italic text-muted-foreground/70">No other names yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {aliases.map((a) => (
            <li key={a.id} className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-muted/40 py-0.5 pl-2.5 pr-1 text-sm">
              {a.alias}
              <button
                type="button"
                onClick={() => remove(a.id)}
                disabled={isPending}
                aria-label={`Remove alias ${a.alias}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex max-w-sm gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Another name they are credited as" aria-label="New alias" />
        <Button type="submit" size="sm" variant="outline" disabled={isPending || !draft.trim()} className="gap-1.5">
          {isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
        </Button>
      </form>
    </div>
  );
}
