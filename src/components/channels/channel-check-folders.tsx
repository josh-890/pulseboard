"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AddChannelSheet } from "@/components/channels/add-channel-sheet";
import { updateChannelFolderAction } from "@/lib/actions/channel-actions";
import type { UnclaimedArchiveFolder } from "@/lib/services/channel-check-service";

type ChannelCheckFoldersProps = {
  folders: UnclaimedArchiveFolder[];
  labels: { id: string; name: string }[];
};

/** `SB-ShowyBeauty` → Shortname `SB`, name `ShowyBeauty` — the user's own convention */
function splitFolder(folder: string): { shortName: string; name: string } {
  const dash = folder.indexOf("-");
  return dash > 0 ? { shortName: folder.slice(0, dash), name: folder.slice(dash + 1) } : { shortName: "", name: folder };
}

export function ChannelCheckFolders({ folders, labels }: ChannelCheckFoldersProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function claim(channelId: string, channelName: string, folder: string) {
    setBusy(`${folder}|${channelId}`);
    try {
      const result = await updateChannelFolderAction(channelId, folder);
      if (!result.success) {
        toast.error(result.error ?? "Failed to set the archive folder");
        return;
      }
      toast.success(`${channelName} now has archive folder ${folder}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (folders.length === 0) {
    return (
      <p className="rounded-xl border border-white/15 bg-card/40 px-4 py-3 text-sm text-muted-foreground">
        Every archive channel folder belongs to a channel.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {folders.map((f) => {
        const split = splitFolder(f.chanFolderName);
        return (
          <li
            key={f.chanFolderName}
            className="rounded-xl border border-white/15 bg-card/40 px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <FolderOpen size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate font-medium">{f.chanFolderName}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {f.folders} {f.folders === 1 ? "folder" : "folders"}
                </span>
              </div>
              <AddChannelSheet
                labels={labels}
                triggerLabel="Create channel…"
                initialValues={{ name: split.name, shortName: split.shortName, channelFolder: f.chanFolderName }}
                onCreated={() => router.refresh()}
              />
            </div>
            {f.hints.length > 0 ? (
              <ul className="mt-2 space-y-1.5" aria-label={`Channels that may own ${f.chanFolderName}`}>
                {f.hints.map((h) => {
                  const key = `${f.chanFolderName}|${h.id}`;
                  return (
                    <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium">{h.name}</span>
                        {h.shortName && <span className="text-muted-foreground"> · {h.shortName}</span>}
                        {h.labelName && <span className="text-muted-foreground"> · {h.labelName}</span>}
                        <span className="block text-xs text-muted-foreground">
                          {h.by === "shortName" ? "same Shortname" : "same name"} — archive folder now:{" "}
                          {h.channelFolder ? <span className="text-foreground">{h.channelFolder}</span> : "none"}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => claim(h.id, h.name, f.chanFolderName)}
                        aria-label={`Set ${f.chanFolderName} as the archive folder of ${h.name}`}
                      >
                        {busy === key && <Loader2 size={14} className="animate-spin" aria-hidden />}
                        {h.channelFolder ? "Replace its archive folder" : "Set as its archive folder"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                No channel has this Shortname or name — create it, or set the folder on the channel page.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
