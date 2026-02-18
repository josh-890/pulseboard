"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateProfileImageLabel } from "@/lib/actions/setting-actions";
import type { ProfileImageLabel } from "@/lib/services/setting-service";

type ProfileImageLabelsProps = {
  labels: ProfileImageLabel[];
};

export function ProfileImageLabels({ labels }: ProfileImageLabelsProps) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(labels.map((l) => [l.slot, l.label])),
  );
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();
  const [savingSlot, setSavingSlot] = useState<string | null>(null);

  function handleSave(slot: string) {
    const label = values[slot]?.trim();
    if (!label) return;

    const original = labels.find((l) => l.slot === slot)?.label;
    if (label === original) return;

    setSavingSlot(slot);
    startTransition(async () => {
      const result = await updateProfileImageLabel({ slot, label });
      if (result.success) {
        setSaved((prev) => ({ ...prev, [slot]: true }));
        setTimeout(() => {
          setSaved((prev) => ({ ...prev, [slot]: false }));
        }, 2000);
      }
      setSavingSlot(null);
    });
  }

  return (
    <div className="space-y-3">
      {labels.map((item, i) => {
        const changed = values[item.slot]?.trim() !== item.label;
        const isSaving = isPending && savingSlot === item.slot;
        const isSaved = saved[item.slot];

        return (
          <div key={item.slot} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-sm font-medium text-muted-foreground">
              Slot {i + 1}
            </span>
            <Input
              value={values[item.slot] ?? ""}
              onChange={(e) =>
                setValues((prev) => ({
                  ...prev,
                  [item.slot]: e.target.value,
                }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave(item.slot);
              }}
              className="max-w-xs"
              placeholder={`Photo ${i + 1}`}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSave(item.slot)}
              disabled={!changed || isSaving}
              className="min-w-[72px]"
            >
              {isSaving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : isSaved ? (
                <Check size={14} className="text-green-500" />
              ) : (
                "Save"
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
