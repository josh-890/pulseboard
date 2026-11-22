"use client";

import { useRef, useState } from "react";
import { Loader2, PenLine, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { clearComposerDrawingAction, setComposerDrawingAction } from "@/lib/actions/composer-manage-actions";

export type ComposerDrawingUploadProps = {
  tagId: string;
  tagName: string;
  drawingUrl: string | null;
  /** After a change: refresh the page's data */
  onChanged: () => void;
};

/**
 * A value's line drawing (ADR-0043): SVG, PNG or WebP, preferred on the tile
 * over the photo example. Stored as a transparent WebP of at most 512 px.
 */
export function ComposerDrawingUpload({ tagId, tagName, drawingUrl, onChanged }: ComposerDrawingUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    const form = new FormData();
    form.set("file", file);
    const r = await setComposerDrawingAction(tagId, form);
    setBusy(false);
    if (!r.success) return void toast.error(r.error ?? "The drawing could not be read");
    toast.success(`Drawing for ${tagName} saved`);
    onChanged();
  };

  const clear = async () => {
    setBusy(true);
    const r = await clearComposerDrawingAction(tagId);
    setBusy(false);
    if (!r.success) return void toast.error(r.error ?? "Could not remove the drawing");
    onChanged();
  };

  return (
    <div className="space-y-1.5" data-testid="composer-drawing">
      <span className="text-xs font-semibold">Line drawing</span>
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-white dark:bg-white/90">
          {drawingUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a MinIO drawing, shown as stored
            <img src={drawingUrl} alt={`Drawing of ${tagName}`} className="h-full w-full object-contain" data-testid="composer-drawing-img" />
          ) : (
            <PenLine size={20} className="text-slate-400" aria-hidden />
          )}
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <input
            ref={input}
            type="file"
            accept="image/svg+xml,image/png,image/webp,image/jpeg"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            data-testid="composer-drawing-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1 text-xs font-medium transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Upload size={13} aria-hidden />}
            {drawingUrl ? "Replace" : "Upload"}
          </button>
          {drawingUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void clear()}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <Trash2 size={13} aria-hidden /> Remove
            </button>
          )}
          <span className="text-[11px] text-muted-foreground">SVG, PNG or WebP · shown on the tile before the photo example</span>
        </div>
      </div>
    </div>
  );
}
