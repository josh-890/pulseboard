"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Download,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  applyIntensityCatalogImportAction,
  previewIntensityCatalogImportAction,
} from "@/lib/actions/intensity-catalog-actions";
import type { ImportChange } from "@/lib/intensity-catalog-transfer";
import type { CatalogImportPreview } from "@/lib/services/intensity-catalog-transfer-service";

const KIND = {
  add: {
    icon: Plus,
    label: "added",
    tone: "text-emerald-600 dark:text-emerald-400",
  },
  change: {
    icon: Pencil,
    label: "changed",
    tone: "text-sky-600 dark:text-sky-400",
  },
  remove: {
    icon: Minus,
    label: "removed",
    tone: "text-rose-600 dark:text-rose-400",
  },
} as const;

// Export the catalog as an Excel workbook, work on it offline, import it back
// (2026-10-26). An import shows what it would add, change and remove — and what
// stays because sessions use it — before anything is written.
export function IntensityCatalogTransfer() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CatalogImportPreview | null>(null);
  const [reading, startReading] = useTransition();
  const [applying, startApplying] = useTransition();

  const choose = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setPreview(null);
    startReading(async () => {
      const form = new FormData();
      form.set("file", f);
      const res = await previewIntensityCatalogImportAction(form);
      if (!res.success) {
        toast.error(res.error);
        setFile(null);
        return;
      }
      setPreview(res.preview);
    });
  };

  const close = () => {
    setFile(null);
    setPreview(null);
    if (input.current) input.current.value = "";
  };

  const apply = () => {
    if (!file || !preview) return;
    startApplying(async () => {
      const form = new FormData();
      form.set("file", file);
      form.set("fingerprint", preview.fingerprint);
      const res = await applyIntensityCatalogImportAction(form);
      if (!res.success) {
        toast.error(res.error ?? "The import failed");
        return;
      }
      toast.success(
        `Catalog imported — ${preview.changes.length} ${preview.changes.length === 1 ? "change" : "changes"}`,
      );
      close();
      router.refresh();
    });
  };

  const bySheet = new Map<string, ImportChange[]>();
  for (const c of preview?.changes ?? [])
    bySheet.set(c.sheet, [...(bySheet.get(c.sheet) ?? []), c]);
  const count = (kind: ImportChange["kind"]) =>
    preview?.changes.filter((c) => c.kind === kind).length ?? 0;
  const blocked = !!preview?.problems.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" asChild>
        <a href="/api/intensity-catalog/export" download>
          <Download size={14} aria-hidden="true" /> Export
        </a>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => input.current?.click()}
        disabled={reading}
      >
        {reading ? (
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        ) : (
          <Upload size={14} aria-hidden="true" />
        )}
        Import…
      </Button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        aria-label="Choose a catalog workbook to import"
        onChange={(e) => choose(e.target.files?.[0])}
      />

      <Dialog
        open={!!preview}
        onOpenChange={(open) => !open && !applying && close()}
      >
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import the intensity catalog</DialogTitle>
            <DialogDescription>
              {file?.name} — nothing changes until you apply.
            </DialogDescription>
          </DialogHeader>

          {preview && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-sm">
              {blocked ? (
                <section
                  aria-label="Problems"
                  className="rounded-md border border-rose-500/40 bg-rose-500/5 p-3"
                >
                  <h3 className="mb-1 flex items-center gap-1.5 font-medium text-rose-700 dark:text-rose-400">
                    <AlertTriangle size={14} aria-hidden="true" /> Fix these in
                    the file, then import it again
                  </h3>
                  <ul className="space-y-0.5 text-xs">
                    {preview.problems.map((p, i) => (
                      <li key={i}>
                        <span className="font-medium">
                          {p.sheet}
                          {p.row ? `, row ${p.row}` : ""}:
                        </span>{" "}
                        {p.message}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : (
                <p className="text-muted-foreground">
                  {preview.changes.length === 0
                    ? "The file matches the catalog — there is nothing to change."
                    : (["add", "change", "remove"] as const)
                        .filter((k) => count(k) > 0)
                        .map((k) => `${count(k)} ${KIND[k].label}`)
                        .join(" · ")}
                </p>
              )}

              {[...bySheet].map(([sheet, list]) => (
                <section key={sheet} aria-label={sheet}>
                  <h3 className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
                    {sheet}
                  </h3>
                  <ul className="space-y-1">
                    {list.map((c, i) => {
                      const k = KIND[c.kind];
                      return (
                        <li key={i} className="flex gap-2">
                          <k.icon
                            size={13}
                            className={cn("mt-0.5 shrink-0", k.tone)}
                            aria-label={k.label}
                          />
                          <div className="min-w-0">
                            <span className="font-medium">{c.label}</span>
                            {c.details.length > 0 && (
                              <span className="text-muted-foreground">
                                {" "}
                                — {c.details.join("; ")}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}

              {preview.kept.length > 0 && (
                <section
                  aria-label="Stays"
                  className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3"
                >
                  <h3 className="mb-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Left out of the file, but stays — sessions use it
                  </h3>
                  <ul className="space-y-0.5 text-xs">
                    {preview.kept.map((k, i) => (
                      <li key={i}>
                        <span className="font-medium">{k.label}</span>{" "}
                        <span className="text-muted-foreground">
                          ({k.sheet}: {k.reason})
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={close} disabled={applying}>
              Cancel
            </Button>
            <Button
              onClick={apply}
              disabled={blocked || applying || !preview?.changes.length}
            >
              {applying && (
                <Loader2
                  size={14}
                  className="animate-spin"
                  aria-hidden="true"
                />
              )}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
