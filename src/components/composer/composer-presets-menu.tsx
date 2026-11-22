"use client";

import { useState } from "react";
import { Bookmark, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Composition } from "@/lib/composer";
import { deleteComposerPresetAction, saveComposerPresetAction } from "@/lib/actions/composer-actions";

export type ComposerPresetItem = { id: string; name: string } & Composition;

export type ComposerPresetsMenuProps = {
  presets: ComposerPresetItem[];
  onPresetsChange: (presets: ComposerPresetItem[]) => void;
  /** What "Save" keeps: the composition being built, or the photo's draft */
  current: Composition;
  /** "photo" — onto the draft; "selection" / "paint" — as the composition or brush */
  target: "photo" | "selection" | "paint";
  name: (tagId: string) => string;
  onUse: (preset: ComposerPresetItem) => void;
};

const TARGET_TEXT = { photo: "onto this photo", selection: "on the selection", paint: "as the brush" } as const;

/**
 * Presets (ADR-0042, S6): named compositions. Use one on the photo on screen,
 * as the change for a selection, or as the brush; save what is built now under
 * a name (the same name replaces it).
 */
export function ComposerPresetsMenu({ presets, onPresetsChange, current, target, name, onUse }: ComposerPresetsMenuProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const canSave = current.adds.length + current.removes.length > 0;

  const save = async () => {
    setBusy(true);
    const r = await saveComposerPresetAction(newName, current.adds, current.removes);
    setBusy(false);
    if (!r.success) return void toast.error(r.error);
    onPresetsChange([...presets.filter((p) => p.name !== r.preset.name), r.preset]);
    setNewName("");
    toast.success(`Preset “${r.preset.name}” saved`);
  };
  const remove = async (id: string) => {
    const r = await deleteComposerPresetAction(id);
    if (!r.success) return void toast.error(r.error);
    onPresetsChange(presets.filter((p) => p.id !== id));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" data-testid="composer-presets">
          <Bookmark size={14} /> Presets
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 space-y-3 p-3"
        onKeyDown={(e) => e.stopPropagation()}
        // Back to the workbench, not the button: Enter right after should write, not reopen this
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div>
          <p className="text-sm font-semibold">Presets</p>
          <p className="text-xs text-muted-foreground">Use one {TARGET_TEXT[target]}.</p>
        </div>
        {presets.length === 0 ? (
          <p className="text-xs text-muted-foreground">None yet — build a composition and save it below.</p>
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto" data-testid="composer-preset-list">
            {presets.map((p) => (
              <li key={p.id} className="group flex items-start gap-1 rounded-md hover:bg-muted/60">
                <button
                  type="button"
                  onClick={(e) => {
                    onUse(p);
                    // Leave the closing popover at once, so the next key (Enter) reaches the workbench
                    e.currentTarget.blur();
                    setOpen(false);
                  }}
                  className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="composer-preset"
                  data-name={p.name}
                >
                  <span className="block text-xs font-medium">{p.name}</span>
                  <span className="mt-0.5 flex flex-wrap gap-0.5 text-[10px]">
                    {p.adds.map((id) => (
                      <span key={id} className="rounded-full bg-emerald-500/10 px-1 text-emerald-700 dark:text-emerald-300">
                        + {name(id)}
                      </span>
                    ))}
                    {p.removes.map((id) => (
                      <span key={id} className="rounded-full bg-rose-500/10 px-1 text-rose-700 dark:text-rose-300">
                        − {name(id)}
                      </span>
                    ))}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  aria-label={`Delete preset ${p.name}`}
                  className="mt-1 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex items-center gap-1.5 border-t border-border/60 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave && newName.trim()) void save();
          }}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={canSave ? "Save what is picked as…" : "Pick tags to save a preset"}
            disabled={!canSave || busy}
            className="h-8 text-xs"
            aria-label="Preset name"
            data-testid="composer-preset-name"
          />
          <Button type="submit" size="sm" className="h-8" disabled={!canSave || !newName.trim() || busy} data-testid="composer-preset-save">
            {busy ? <Loader2 size={14} className="animate-spin" /> : "Save"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
