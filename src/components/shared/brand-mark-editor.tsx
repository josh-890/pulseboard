"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Palette, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EntityMark } from "@/components/shared/entity-mark";
import { BRAND_COLORS, BRAND_FONTS, resolveBrandMark, type EntityBrand } from "@/lib/brand-mark";
import { clearBrandLogoAction, setBrandLogoAction, setBrandStyleAction } from "@/lib/actions/brand-actions";
import { cn } from "@/lib/utils";

type BrandMarkEditorProps = {
  kind: "channel" | "label" | "artist";
  id: string;
  brand: EntityBrand;
};

/**
 * "Edit look": the generated mark's font and colour (from the name unless you
 * pick one) and an uploaded logo — an artist's portrait — which wins over both.
 */
export function BrandMarkEditor({ kind, id, brand }: BrandMarkEditorProps) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [isPending, start] = useTransition();
  const [font, setFont] = useState<string | null>(brand.markFont ?? null);
  const [color, setColor] = useState<string | null>(brand.markColor ?? null);
  const generated = resolveBrandMark({ ...brand, markFont: null, markColor: null });
  const logoNoun = kind === "artist" ? "portrait" : "logo";
  const preview: EntityBrand = { ...brand, logoUrl: null, markFont: font, markColor: color };
  const dirty = font !== (brand.markFont ?? null) || color !== (brand.markColor ?? null);

  function onOpenChange(next: boolean) {
    if (next) {
      setFont(brand.markFont ?? null);
      setColor(brand.markColor ?? null);
    }
    setOpen(next);
  }

  function save() {
    start(async () => {
      const res = await setBrandStyleAction(kind, id, { markFont: font, markColor: color });
      if (!res.success) {
        toast.error(res.error ?? "Could not save the look");
        return;
      }
      toast.success("Look saved");
      setOpen(false);
      router.refresh();
    });
  }

  function upload(file: File) {
    const form = new FormData();
    form.set("file", file);
    start(async () => {
      const res = await setBrandLogoAction(kind, id, form);
      if (!res.success) {
        toast.error(res.error ?? `Could not set the ${logoNoun}`);
        return;
      }
      toast.success(kind === "artist" ? "Portrait set" : "Logo set");
      router.refresh();
    });
  }

  function removeLogo() {
    start(async () => {
      const res = await clearBrandLogoAction(kind, id);
      if (!res.success) {
        toast.error(res.error ?? `Could not remove the ${logoNoun}`);
        return;
      }
      toast.success("Back to the generated mark");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Palette size={14} /> Edit look
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Look of {brand.name}</DialogTitle>
          <DialogDescription>
            Without a {logoNoun}, the mark is the name in a brand font and colour picked from the name. Pick your own,
            or upload a {logoNoun} — it wins over the generated mark.
          </DialogDescription>
        </DialogHeader>

        {/* Live preview: the wordmark and the small tile */}
        <div className="flex items-center gap-4 rounded-xl border border-white/15 bg-card/60 p-4">
          <EntityMark brand={preview} variant="tile" size="lg" round={kind === "artist"} />
          <div className="min-w-0 flex-1">
            <EntityMark brand={preview} variant="wordmark" size="lg" />
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Font</legend>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Font">
            {BRAND_FONTS.map((f) => {
              const selected = (font ?? generated.generatedFontKey) === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setFont(f.key === generated.generatedFontKey ? null : f.key)}
                  className={cn(
                    "truncate rounded-lg border px-2 py-1.5 text-sm transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "border-primary bg-primary/10" : "border-white/15 hover:bg-white/5",
                  )}
                  title={f.key === generated.generatedFontKey ? `${f.label} (from the name)` : f.label}
                >
                  <span className={f.className}>{f.label}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Colour</legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Colour">
            {BRAND_COLORS.map((c) => {
              const selected = (color ?? generated.generatedColorKey) === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={c.key === generated.generatedColorKey ? `${c.label} (from the name)` : c.label}
                  title={c.key === generated.generatedColorKey ? `${c.label} (from the name)` : c.label}
                  onClick={() => setColor(c.key === generated.generatedColorKey ? null : c.key)}
                  className={cn(
                    "h-7 w-7 rounded-full transition-transform hover:scale-110",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    c.swatch,
                    selected && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                  )}
                />
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {kind === "artist" ? "Portrait" : "Logo"}
          </span>
          {brand.logoUrl && <EntityMark brand={brand} variant="tile" size="sm" round={kind === "artist"} />}
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label={`Choose a ${logoNoun} image`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={isPending} onClick={() => input.current?.click()}>
            <ImagePlus size={13} /> {brand.logoUrl ? `Replace ${logoNoun}` : `Upload ${logoNoun}`}
          </Button>
          {brand.logoUrl && (
            <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs text-muted-foreground" disabled={isPending} onClick={removeLogo}>
              <Trash2 size={12} /> Remove
            </Button>
          )}
          <span className="w-full text-[11px] text-muted-foreground">PNG, JPG or WebP · transparency is kept</span>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            disabled={isPending || (font === null && color === null)}
            onClick={() => {
              setFont(null);
              setColor(null);
            }}
          >
            <RotateCcw size={13} /> From the name
          </Button>
          <Button size="sm" disabled={isPending || !dirty} onClick={save}>
            {isPending && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            Save look
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
