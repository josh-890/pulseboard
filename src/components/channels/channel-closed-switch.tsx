"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { setChannelClosedAction } from "@/lib/actions/channel-actions";

/** "No longer publishing" — the hero then says Closed and its years end with its last set */
export function ChannelClosedSwitch({ channelId, initialClosed }: { channelId: string; initialClosed: boolean }) {
  const [closed, setClosed] = useState(initialClosed);
  const [isPending, start] = useTransition();

  function toggle(next: boolean) {
    setClosed(next);
    start(async () => {
      const res = await setChannelClosedAction(channelId, next);
      if (!res.success) {
        setClosed(!next);
        toast.error(res.error ?? "Could not save");
      }
    });
  }

  return (
    <label className="flex items-center justify-between gap-4">
      <span>
        <span className="block text-sm font-medium">Closed</span>
        <span className="block text-xs text-muted-foreground">The channel no longer publishes</span>
      </span>
      <Switch checked={closed} onCheckedChange={toggle} disabled={isPending} aria-label="Channel closed" />
    </label>
  );
}
