"use client";

import { Crosshair, X } from "lucide-react";
import { useArmedTag } from "@/hooks/use-armed-tag";
import { tagFitsEntity, type TaggableEntity } from "@/lib/tag-domains";
import { cn } from "@/lib/utils";

export type ArmedTagChipProps = {
  entityType: TaggableEntity;
  /** Opens the palette in pick mode to arm a tag */
  onArmRequest: () => void;
  tone?: "default" | "onDark";
};

// The armed tag (painter): shows what `P` applies, or offers to arm one.
export function ArmedTagChip({ entityType, onArmRequest, tone = "default" }: ArmedTagChipProps) {
  const { armed, disarm } = useArmedTag();
  const onDark = tone === "onDark";
  const fits = armed ? tagFitsEntity(armed.group.domain, entityType) : true;

  if (!armed) {
    return (
      <button
        type="button"
        onClick={onArmRequest}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          onDark ? "border-white/20 text-white/55 hover:text-white" : "border-white/20 text-muted-foreground hover:text-foreground",
        )}
        title="Arm a tag to paint with P (Shift+T)"
      >
        <Crosshair size={11} aria-hidden="true" />
        Arm tag
        <kbd className="text-[10px] opacity-70">⇧T</kbd>
      </button>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs",
        onDark ? "border-white/25 text-white/90" : "border-white/20 text-foreground",
        !fits && "opacity-40",
      )}
      title={fits ? "P paints it on, Shift+P takes it off" : `${armed.name} cannot be applied here`}
    >
      <Crosshair size={11} className="text-primary" aria-hidden="true" />
      <span className="inline-block size-1.5 rounded-full" style={{ backgroundColor: armed.group.color }} aria-hidden="true" />
      <button type="button" onClick={onArmRequest} className="max-w-[8rem] truncate hover:underline" aria-label={`Armed: ${armed.name} — change`}>
        {armed.name}
      </button>
      <kbd className="text-[10px] opacity-70">P</kbd>
      <button type="button" onClick={disarm} className="rounded p-0.5 opacity-70 hover:opacity-100" aria-label="Disarm tag">
        <X size={10} />
      </button>
    </span>
  );
}
