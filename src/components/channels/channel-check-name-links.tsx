"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { linkChannelNameAction, rejectNameOnlyLinkAction } from "@/lib/actions/channel-actions";
import type { NameOnlyLink } from "@/lib/services/channel-check-service";

type ChannelCheckNameLinksProps = {
  links: NameOnlyLink[];
};

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

export function ChannelCheckNameLinks({ links }: ChannelCheckNameLinksProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function anchor(link: NameOnlyLink) {
    setBusy(`${link.channelName}|${link.channelId}`);
    try {
      const result = await linkChannelNameAction(link.channelId, link.channelName);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`"${link.channelName}" is now an import alias of ${link.appName}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function reject(link: NameOnlyLink) {
    setBusy(`${link.channelName}|${link.channelId}`);
    try {
      const result = await rejectNameOnlyLinkAction(link.channelId, link.channelName);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${plural(result.count, "staged set")} left ${link.appName} — they wait for a channel now`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (links.length === 0) {
    return (
      <p className="rounded-xl border border-white/15 bg-card/40 px-4 py-3 text-sm text-muted-foreground">
        Every channel name in your staged sets is anchored by an import alias.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {links.map((link) => {
        const key = `${link.channelName}|${link.channelId}`;
        return (
          <li
            key={key}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-card/40 px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{link.channelName}</span>
                <ArrowRight size={14} className="text-muted-foreground" aria-label="linked by name to" />
                <span className="font-medium">{link.appName}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {plural(link.stagedSets, "staged set")}
                {link.openStagedSets !== link.stagedSets && `, ${link.openStagedSets.toLocaleString()} open`} — linked by
                name only
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" disabled={busy !== null} onClick={() => anchor(link)}>
                {busy === key && <Loader2 size={14} className="animate-spin" aria-hidden />}
                Add as import alias
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={busy !== null}>
                    Not this one
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      &ldquo;{link.channelName}&rdquo; is not {link.appName}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {plural(link.openStagedSets, "open staged set")} lose {link.appName} and wait for a channel —
                      you link them again under Staged sets without a channel. Promoted sets keep their channel.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => reject(link)}>Disconnect</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
