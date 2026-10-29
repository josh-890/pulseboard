"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EntityCombobox } from "@/components/shared/entity-combobox";
import { AddChannelSheet } from "@/components/channels/add-channel-sheet";
import { linkChannelNameAction } from "@/lib/actions/channel-actions";
import type { CatalogueChannelHint, CatalogueChannelName } from "@/lib/services/channel-check-service";

type ChannelCheckCatalogueRowProps = {
  row: CatalogueChannelName & { hints: CatalogueChannelHint[] };
  channels: { id: string; label: string; description?: string }[];
  labels: { id: string; name: string }[];
};

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

const HINT_REASON: Record<CatalogueChannelHint["by"], string> = {
  archive: "owns the archive folders it matched",
  name: "same name",
  shortName: "same Shortname",
};

/** What linking this name connects, waiting-on-you first */
function connects(row: CatalogueChannelName): string[] {
  const parts: string[] = [];
  if (row.archiveFolders) parts.push(plural(row.archiveFolders, "archive folder"));
  if (row.openStaged) parts.push(plural(row.openStaged, "waiting staged set"));
  if (row.contacts) parts.push(plural(row.contacts, "Contact"));
  if (row.sets) parts.push(plural(row.sets, "catalogue set"));
  return parts;
}

/** One catalogue channel name no import alias links: link it to a channel, or create the channel */
export function ChannelCheckCatalogueRow({ row, channels, labels }: ChannelCheckCatalogueRowProps) {
  const router = useRouter();
  const [channelId, setChannelId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const picked = channels.find((c) => c.id === channelId);
  const years =
    row.firstYear && row.lastYear
      ? row.firstYear === row.lastYear
        ? String(row.firstYear)
        : `${row.firstYear}–${row.lastYear}`
      : null;

  async function link(id: string, name: string) {
    setBusy(id);
    try {
      const result = await linkChannelNameAction(id, row.channelName);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `"${row.channelName}" → ${name}` + (result.count ? `: ${plural(result.count, "staged set")} connected` : ""),
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="rounded-xl border border-white/15 bg-card/40 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium">{row.channelName}</p>
          {row.otherSpellings.length > 0 && (
            <p className="text-xs text-muted-foreground">also written {row.otherSpellings.join(", ")}</p>
          )}
          <p className="text-xs tabular-nums text-muted-foreground">
            {connects(row).join(" · ")}
            {years && ` · ${years}`}
          </p>
          {row.archiveChannelFolders.length > 0 && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <FolderOpen size={12} className="shrink-0" aria-hidden />
              archive folders in {row.archiveChannelFolders.join(", ")}
            </p>
          )}
        </div>
        <AddChannelSheet
          labels={labels}
          triggerLabel="Create channel…"
          importAlias={row.channelName}
          onCreated={() => router.refresh()}
        />
      </div>

      {row.hints.length > 0 && (
        <ul className="mt-2 space-y-1.5" aria-label={`Channels that may be ${row.channelName}`}>
          {row.hints.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{h.name}</span>
                {h.shortName && <span className="text-muted-foreground"> · {h.shortName}</span>}
                {h.labelName && <span className="text-muted-foreground"> · {h.labelName}</span>}
                <span className="ml-2 text-xs text-muted-foreground">{HINT_REASON[h.by]}</span>
              </span>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => link(h.id, h.name)}>
                {busy === h.id ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ArrowRight size={14} aria-hidden />}
                Link to {h.name}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-72">
          <EntityCombobox
            entities={channels}
            value={channelId}
            onChange={setChannelId}
            placeholder="Link to an existing channel…"
            emptyLabel="No channel"
            disabled={busy !== null}
          />
        </div>
        <Button size="sm" disabled={!picked || busy !== null} onClick={() => picked && link(picked.id, picked.label)}>
          {busy === channelId && picked && <Loader2 size={14} className="animate-spin" aria-hidden />}
          {picked ? `Link to ${picked.label}` : "Link"}
        </Button>
      </div>
    </li>
  );
}
