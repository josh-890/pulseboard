"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createMotifTemplateAction,
  updateMotifTemplateAction,
  deleteMotifTemplateAction,
} from "@/lib/actions/motif-template-actions";
import type { MotifTemplateRecord, MotifKeypoint } from "@/lib/services/motif-template-service";

type SlotLabel = { slot: number; label: string };

type Draft = {
  id: string | null;
  name: string;
  slot: number;
  aspectW: number;
  aspectH: number;
  bakeLongSide: number;
  minSourcePx: number | null;
  keypoints: MotifKeypoint[];
};

const BLANK: Draft = {
  id: null,
  name: "",
  slot: 1,
  aspectW: 2,
  aspectH: 3,
  bakeLongSide: 2048,
  minSourcePx: 900,
  keypoints: [
    { name: "left_eye", x: 0.38, y: 0.4 },
    { name: "right_eye", x: 0.62, y: 0.4 },
    { name: "mouth", x: 0.5, y: 0.62 },
  ],
};

const PREVIEW_W = 220;

export function MotifTemplatesCatalog({
  templates,
  slotLabels,
}: {
  templates: MotifTemplateRecord[];
  slotLabels: SlotLabel[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragIdx = useRef<number | null>(null);

  const previewH = Math.round((PREVIEW_W * (draft?.aspectH ?? 3)) / (draft?.aspectW ?? 2));

  const startNew = () => { setError(null); setDraft({ ...BLANK }); };
  const startEdit = (t: MotifTemplateRecord) => {
    setError(null);
    setDraft({
      id: t.id, name: t.name, slot: t.slot, aspectW: t.aspectW, aspectH: t.aspectH,
      bakeLongSide: t.bakeLongSide, minSourcePx: t.minSourcePx, keypoints: t.keypoints.map((k) => ({ ...k })),
    });
  };

  const updateKp = useCallback((i: number, patch: Partial<MotifKeypoint>) => {
    setDraft((d) => (d ? { ...d, keypoints: d.keypoints.map((k, j) => (j === i ? { ...k, ...patch } : k)) } : d));
  }, []);

  const onBoxMove = useCallback((e: React.PointerEvent) => {
    if (dragIdx.current === null || !boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    updateKp(dragIdx.current, { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
  }, [updateKp]);

  const save = useCallback(async () => {
    if (!draft) return;
    if (!draft.name.trim()) { setError("Name is required"); return; }
    if (draft.keypoints.length < 2) { setError("At least 2 keypoints are required"); return; }
    setSaving(true);
    setError(null);
    const input = {
      name: draft.name.trim(), slot: draft.slot, aspectW: draft.aspectW, aspectH: draft.aspectH,
      bakeLongSide: draft.bakeLongSide, minSourcePx: draft.minSourcePx, keypoints: draft.keypoints,
    };
    const res = draft.id
      ? await updateMotifTemplateAction(draft.id, input)
      : await createMotifTemplateAction(input);
    setSaving(false);
    if (res.success) { setDraft(null); router.refresh(); }
    else setError(res.error ?? "Save failed");
  }, [draft, router]);

  const remove = useCallback(async (id: string) => {
    if (!confirm("Delete this template?")) return;
    const res = await deleteMotifTemplateAction(id);
    if (res.success) router.refresh();
  }, [router]);

  return (
    <div className="space-y-4">
      {/* List */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-4 shadow-md backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Templates</h2>
          <button onClick={startNew} className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Plus size={13} /> New template
          </button>
        </div>
        {templates.length === 0 ? (
          <p className="text-xs text-muted-foreground">No templates yet.</p>
        ) : (
          <div className="space-y-1.5">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-background/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {slotLabels.find((s) => s.slot === t.slot)?.label ?? `Slot ${t.slot}`} · {t.aspectW}:{t.aspectH} · {t.bakeLongSide}px · {t.keypoints.length} keypoints
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => startEdit(t)} className="rounded-md border border-white/15 px-2 py-1 text-xs hover:bg-muted">Edit</button>
                  <button onClick={() => remove(t.id)} className="rounded-md border border-white/15 p-1 text-muted-foreground hover:text-destructive" aria-label="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor */}
      {draft && (
        <div className="rounded-2xl border border-white/20 bg-card/70 p-4 shadow-md backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{draft.id ? "Edit template" : "New template"}</h2>
            <button onClick={() => setDraft(null)} className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Close"><X size={15} /></button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Fields */}
            <div className="space-y-3">
              <Field label="Name">
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full rounded-md border border-white/15 bg-background/60 px-2 py-1 text-sm" />
              </Field>
              <Field label="Slot">
                <select value={draft.slot} onChange={(e) => setDraft({ ...draft, slot: Number(e.target.value) })} className="w-full rounded-md border border-white/15 bg-background/60 px-2 py-1 text-sm">
                  {slotLabels.map((s) => <option key={s.slot} value={s.slot}>{s.slot}. {s.label}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Aspect W"><NumInput value={draft.aspectW} onChange={(v) => setDraft({ ...draft, aspectW: v })} /></Field>
                <Field label="Aspect H"><NumInput value={draft.aspectH} onChange={(v) => setDraft({ ...draft, aspectH: v })} /></Field>
              </div>
              <Field label="Bake long side (px)"><NumInput value={draft.bakeLongSide} onChange={(v) => setDraft({ ...draft, bakeLongSide: v })} /></Field>
              <Field label="Min source px (warn below)"><NumInput value={draft.minSourcePx ?? 0} onChange={(v) => setDraft({ ...draft, minSourcePx: v || null })} /></Field>
            </div>

            {/* Keypoint preview */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Target keypoints (drag)</p>
              <div
                ref={boxRef}
                onPointerMove={onBoxMove}
                onPointerUp={() => { dragIdx.current = null; }}
                onPointerLeave={() => { dragIdx.current = null; }}
                className="relative mx-auto rounded-lg border border-amber-500/40 bg-muted/30"
                style={{ width: PREVIEW_W, height: previewH }}
              >
                {draft.keypoints.map((k, i) => (
                  <div
                    key={i}
                    onPointerDown={(e) => { e.preventDefault(); dragIdx.current = i; }}
                    title={k.name}
                    className="absolute -ml-2 -mt-2 h-4 w-4 cursor-grab rounded-full border-2 border-white bg-amber-500 active:cursor-grabbing"
                    style={{ left: `${k.x * 100}%`, top: `${k.y * 100}%` }}
                  />
                ))}
              </div>
              <div className="space-y-1">
                {draft.keypoints.map((k, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      value={k.name}
                      onChange={(e) => updateKp(i, { name: e.target.value })}
                      className="min-w-0 flex-1 rounded border border-white/15 bg-background/60 px-1.5 py-0.5 text-[11px]"
                    />
                    <span className="text-[10px] text-muted-foreground">{(k.x * 100).toFixed(0)},{(k.y * 100).toFixed(0)}</span>
                    <button onClick={() => setDraft({ ...draft, keypoints: draft.keypoints.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-destructive" aria-label="Remove keypoint"><Trash2 size={12} /></button>
                  </div>
                ))}
                <button
                  onClick={() => setDraft({ ...draft, keypoints: [...draft.keypoints, { name: `point_${draft.keypoints.length + 1}`, x: 0.5, y: 0.5 }] })}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <Plus size={11} /> Add keypoint
                </button>
              </div>
            </div>
          </div>

          {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
          <div className="mt-4 flex justify-end">
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
              <Save size={13} /> {draft.id ? "Save changes" : "Create template"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn("w-full rounded-md border border-white/15 bg-background/60 px-2 py-1 text-sm")}
    />
  );
}
