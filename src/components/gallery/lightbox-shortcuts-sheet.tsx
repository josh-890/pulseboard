"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LIGHTBOX_SHORTCUT_GROUPS } from "./lightbox-shortcuts";

// The viewer's keys at a glance (2026-10-17): `?` or the toolbar's ? button.
// Grouped like the toolbar, read from the same list as its tooltips.

export type LightboxShortcutsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function LightboxShortcutsSheet({ open, onOpenChange }: LightboxShortcutsSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="dark max-h-[85vh] overflow-y-auto text-foreground sm:max-w-2xl"
        // Esc closes the sheet only — it must not travel on and close the viewer
        onEscapeKeyDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Everything in the viewer works from the keyboard.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {LIGHTBOX_SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.title}</h3>
              <dl className="space-y-1">
                {group.items.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 text-sm">
                    <dt>{s.label}</dt>
                    <dd className="flex shrink-0 gap-1">
                      {s.keys.map((k) =>
                        k === "…" ? (
                          <span key={k} className="text-muted-foreground">…</span>
                        ) : (
                          <kbd key={k} className="min-w-6 rounded border border-border bg-muted px-1.5 text-center font-mono text-xs leading-5">
                            {k}
                          </kbd>
                        ),
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              {group.note && <p className="mt-1.5 text-xs text-muted-foreground">{group.note}</p>}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
