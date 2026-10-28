"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EntityCombobox } from "@/components/shared/entity-combobox";
import { AddChannelSheet } from "@/components/channels/add-channel-sheet";
import { linkChannelNameAction } from "@/lib/actions/channel-actions";

type ChannelCheckStagedRowProps = {
  channelName: string;
  sets: number;
  channels: { id: string; label: string; description?: string }[];
  labels: { id: string; name: string }[];
};

/** A channel name whose open staged sets have no channel: link it, or create the channel */
export function ChannelCheckStagedRow({ channelName, sets, channels, labels }: ChannelCheckStagedRowProps) {
  const router = useRouter();
  const [channelId, setChannelId] = useState("");
  const [busy, setBusy] = useState(false);
  const picked = channels.find((c) => c.id === channelId);

  async function link() {
    if (!picked) return;
    setBusy(true);
    try {
      const result = await linkChannelNameAction(picked.id, channelName);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`"${channelName}" → ${picked.label}: ${result.count} staged set${result.count === 1 ? "" : "s"} connected`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-white/15 bg-card/40 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="font-medium">{channelName}</span>
          <span className="ml-2 text-xs tabular-nums text-muted-foreground">
            {sets} open staged set{sets === 1 ? "" : "s"}
          </span>
        </div>
        <AddChannelSheet
          labels={labels}
          triggerLabel="Create channel…"
          importAlias={channelName}
          onCreated={() => router.refresh()}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-72">
          <EntityCombobox
            entities={channels}
            value={channelId}
            onChange={setChannelId}
            placeholder="Link to an existing channel…"
            emptyLabel="No channel"
            disabled={busy}
          />
        </div>
        <Button size="sm" disabled={!picked || busy} onClick={link}>
          {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
          {picked ? `Link to ${picked.label}` : "Link"}
        </Button>
      </div>
    </li>
  );
}
