"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { updateHeroBackdropAction } from "@/lib/actions/setting-actions";
import { toast } from "sonner";

type HeroBackdropToggleProps = {
  initialEnabled: boolean;
};

export function HeroBackdropToggle({ initialEnabled }: HeroBackdropToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  const handleChange = (checked: boolean) => {
    setEnabled(checked);
    startTransition(async () => {
      const result = await updateHeroBackdropAction(checked);
      if (!result.success) {
        setEnabled(!checked);
        toast.error(result.error ?? "Failed to update backdrop setting.");
      }
    });
  };

  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-sm">Hero Backdrop</span>
        <p className="text-xs text-muted-foreground">
          Show a blurred cover image behind the session and set hero cards
        </p>
      </div>
      <Switch checked={enabled} onCheckedChange={handleChange} disabled={isPending} />
    </div>
  );
}
