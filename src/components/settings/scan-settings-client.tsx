"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ScrapeLineFormat, WatchPriority } from "@/generated/prisma/client";
import {
  createScrapeSourceAction,
  updateScrapeSourceAction,
  deleteScrapeSourceAction,
  updateScanCadenceAction,
} from "@/lib/actions/scan-actions";

type SourceRow = {
  id: string;
  key: string;
  displayName: string;
  domains: string[];
  isScannable: boolean;
  fileName: string;
  lineFormat: ScrapeLineFormat;
  sortOrder: number;
};

const PRIORITIES: WatchPriority[] = ["HIGH", "NORMAL", "LOW"];

export function ScanSettingsClient({
  sources,
  cadence,
}: {
  sources: SourceRow[];
  cadence: Record<WatchPriority, number>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [cad, setCad] = useState(cadence);
  const [savingCadence, setSavingCadence] = useState<WatchPriority | null>(null);

  function saveCadence(priority: WatchPriority) {
    setSavingCadence(priority);
    startTransition(async () => {
      const res = await updateScanCadenceAction({ priority, days: cad[priority] });
      setSavingCadence(null);
      if (!res.success) {
        toast.error(res.error ?? "Failed");
        return;
      }
      toast.success("Cadence saved");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Cadence */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Scan cadence</h2>
        <p className="text-xs text-muted-foreground">
          A watched person&apos;s scannable page is <span className="font-medium">due</span>{" "}
          once it hasn&apos;t been scanned within this many days (and{" "}
          <span className="font-medium">overdue</span> past 2×), by priority.
        </p>
        <div className="flex flex-wrap gap-4">
          {PRIORITIES.map((p) => (
            <div key={p} className="flex items-center gap-2">
              <span className="w-16 text-xs font-medium uppercase text-muted-foreground">
                {p}
              </span>
              <input
                type="number"
                min={1}
                max={3650}
                value={cad[p]}
                onChange={(e) =>
                  setCad((prev) => ({ ...prev, [p]: Number(e.target.value) }))
                }
                className="w-20 rounded-md border border-border/60 bg-card/60 px-2 py-1 text-sm"
              />
              <span className="text-xs text-muted-foreground">days</span>
              <button
                type="button"
                onClick={() => saveCadence(p)}
                disabled={savingCadence === p}
                className="rounded-md border border-border/50 px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                Save
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Sources */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Scrape sources</h2>
        <div className="flex flex-col gap-2">
          {sources.map((s) => (
            <SourceEditor key={s.id} source={s} />
          ))}
          <NewSource />
        </div>
      </section>
    </div>
  );
}

function SourceEditor({ source }: { source: SourceRow }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState(source);
  const [saving, setSaving] = useState(false);
  const dirty =
    draft.displayName !== source.displayName ||
    draft.isScannable !== source.isScannable ||
    draft.fileName !== source.fileName ||
    draft.lineFormat !== source.lineFormat ||
    draft.domains.join(",") !== source.domains.join(",");

  function save() {
    setSaving(true);
    startTransition(async () => {
      const res = await updateScrapeSourceAction(source.id, {
        displayName: draft.displayName,
        domains: draft.domains,
        isScannable: draft.isScannable,
        fileName: draft.fileName,
        lineFormat: draft.lineFormat,
      });
      setSaving(false);
      if (!res.success) {
        toast.error(res.error ?? "Failed");
        return;
      }
      toast.success("Source saved");
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`Delete scrape source "${source.displayName}"?`)) return;
    startTransition(async () => {
      const res = await deleteScrapeSourceAction(source.id);
      if (!res.success) {
        toast.error(res.error ?? "Failed");
        return;
      }
      toast.success("Source deleted");
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-card/60 px-3 py-2",
        draft.isScannable && "border-primary/30",
      )}
    >
      <span className="w-24 shrink-0 truncate font-mono text-xs text-muted-foreground" title={source.key}>
        {source.key}
      </span>
      <input
        value={draft.displayName}
        onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
        className="w-32 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-sm"
        placeholder="Display name"
      />
      <input
        value={draft.domains.join(", ")}
        onChange={(e) =>
          setDraft({
            ...draft,
            domains: e.target.value
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean),
          })
        }
        className="w-44 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-xs"
        placeholder="domains, comma-separated"
      />
      <label className="flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={draft.isScannable}
          onChange={(e) => setDraft({ ...draft, isScannable: e.target.checked })}
          className="size-3.5 accent-primary"
        />
        scannable
      </label>
      <input
        value={draft.fileName}
        onChange={(e) => setDraft({ ...draft, fileName: e.target.value })}
        className="w-28 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-xs"
        placeholder="file.txt"
      />
      <select
        value={draft.lineFormat}
        onChange={(e) =>
          setDraft({ ...draft, lineFormat: e.target.value as ScrapeLineFormat })
        }
        className="rounded-md border border-border/60 bg-background/60 px-2 py-1 text-xs"
      >
        <option value="URL_ONLY">URL only</option>
        <option value="ICGID_URL">ICG-ID + URL</option>
      </select>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <Save size={12} />
          Save
        </button>
        <button
          type="button"
          onClick={remove}
          aria-label="Delete source"
          className="inline-flex size-7 items-center justify-center rounded-md border border-border/50 text-muted-foreground hover:border-destructive/40 hover:text-destructive"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function NewSource() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [domains, setDomains] = useState("");

  function create() {
    startTransition(async () => {
      const res = await createScrapeSourceAction({
        key: key.trim(),
        displayName: displayName.trim() || key.trim(),
        domains: domains.split(",").map((d) => d.trim()).filter(Boolean),
        isScannable: false,
        fileName: `${key.trim().toLowerCase()}.txt`,
        lineFormat: "ICGID_URL",
      });
      if (!res.success) {
        toast.error(res.error ?? "Failed");
        return;
      }
      toast.success("Source added");
      setKey("");
      setDisplayName("");
      setDomains("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-fit items-center gap-1.5 rounded-md border border-dashed border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus size={12} />
        Add source
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2">
      <input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="KEY (e.g. ONLYFANS)"
        className="w-40 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-xs"
      />
      <input
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="Display name"
        className="w-36 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-xs"
      />
      <input
        value={domains}
        onChange={(e) => setDomains(e.target.value)}
        placeholder="domains, comma-separated"
        className="w-48 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-xs"
      />
      <button
        type="button"
        onClick={create}
        disabled={!key.trim()}
        className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-md border border-border/50 px-2 py-1 text-xs text-muted-foreground"
      >
        Cancel
      </button>
    </div>
  );
}
