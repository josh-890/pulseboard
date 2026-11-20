"use client";

import { ToneSwatch } from "@/components/shared/tone-swatch";

export type ToneMarkButtonsProps = {
  onMark: (tone: "COLOR" | "MONO") => void;
  disabled?: boolean;
};

/** "Mark as Color · B&W" in a gallery's selection bar (ADR-0041) — by hand, wins over the measurement */
export function ToneMarkButtons({ onMark, disabled }: ToneMarkButtonsProps) {
  return (
    <div
      role="group"
      aria-label="Mark as color or black & white"
      data-testid="tone-mark"
      className="inline-flex h-8 items-center rounded-md border border-input bg-background/60 p-0.5 text-xs"
    >
      <span className="px-1.5 text-muted-foreground">Mark</span>
      {(["COLOR", "MONO"] as const).map((t) => (
        <button
          key={t}
          type="button"
          disabled={disabled}
          onClick={() => onMark(t)}
          data-value={t}
          title={t === "MONO" ? "Mark the selected photos black & white" : "Mark the selected photos color"}
          className="inline-flex h-full items-center gap-1.5 rounded px-2 font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        >
          <ToneSwatch tone={t === "MONO" ? "mono" : "color"} size="xs" />
          {t === "MONO" ? "B&W" : "Color"}
        </button>
      ))}
    </div>
  );
}
