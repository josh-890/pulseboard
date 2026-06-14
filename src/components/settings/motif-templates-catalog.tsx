"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, X, ImagePlus, Images, Pin, PinOff, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { LibraryImagePicker } from "@/components/media/library-image-picker";
import type { PickerItem } from "@/components/media/media-picker-shell";
import {
  createMotifTemplateAction,
  updateMotifTemplateAction,
  deleteMotifTemplateAction,
} from "@/lib/actions/motif-template-actions";
import type {
  MotifTemplateRecord,
  MotifKeypoint,
  SilhouetteTransform,
} from "@/lib/services/motif-template-service";

type LocusCategory = { id: string; name: string; groupName: string; boundTemplateId: string | null };

type TemplateWithUrl = MotifTemplateRecord & { silhouetteUrl: string | null };

type Draft = {
  id: string | null;
  name: string;
  /** Locus category this template aligns into (ADR-0014/0016). */
  categoryId: string | null;
  aspectW: number;
  aspectH: number;
  bakeLongSide: number;
  minSourcePx: number | null;
  keypoints: MotifKeypoint[];
  silhouetteRef: string | null;
};

const BLANK: Draft = {
  id: null,
  name: "",
  categoryId: null,
  aspectW: 2,
  aspectH: 3,
  bakeLongSide: 2048,
  minSourcePx: 900,
  silhouetteRef: null,
  keypoints: [
    { name: "left_eye", x: 0.38, y: 0.4 },
    { name: "right_eye", x: 0.62, y: 0.4 },
    { name: "mouth", x: 0.5, y: 0.62 },
  ],
};

const DEFAULT_TX: SilhouetteTransform = { offsetXFrac: 0, offsetYFrac: 0, scale: 1, rotationDeg: 0, opacity: 0.3 };

const PREVIEW_W = 220;
const REF_PREVIEW_W = 400; // enlarge the canvas while a reference image is loaded

export function MotifTemplatesCatalog({
  templates,
  categories,
}: {
  templates: TemplateWithUrl[];
  categories: LocusCategory[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragIdx = useRef<number | null>(null);

  // Reference underlay (visual aid only — never affects keypoint coords)
  const [refUrl, setRefUrl] = useState<string | null>(null);
  const [refFile, setRefFile] = useState<File | null>(null); // present = transient local file, not yet pinned
  const [refSourceUrl, setRefSourceUrl] = useState<string | null>(null); // present = library pick, not yet pinned
  const [refTx, setRefTx] = useState<SilhouetteTransform>(DEFAULT_TX);
  const [pinning, setPinning] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const objectUrlRef = useRef<string | null>(null);
  const panRef = useRef<{ active: boolean; startX: number; startY: number; offX: number; offY: number }>({ active: false, startX: 0, startY: 0, offX: 0, offY: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewW = refUrl ? REF_PREVIEW_W : PREVIEW_W;
  const previewH = Math.round((previewW * (draft?.aspectH ?? 3)) / (draft?.aspectW ?? 2));

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  // Revoke any object URL on unmount.
  useEffect(() => () => revokeObjectUrl(), [revokeObjectUrl]);

  const clearRef = useCallback(() => {
    revokeObjectUrl();
    setRefUrl(null);
    setRefFile(null);
    setRefSourceUrl(null);
    setRefTx(DEFAULT_TX);
  }, [revokeObjectUrl]);

  const pickFromLibrary = useCallback((item: PickerItem) => {
    revokeObjectUrl();
    setRefUrl(item.previewUrl);
    setRefFile(null);
    setRefSourceUrl(item.zoomUrl ?? item.previewUrl); // higher-res source for the server-side copy
    setRefTx(DEFAULT_TX);
    setLibraryOpen(false);
  }, [revokeObjectUrl]);

  const startNew = () => { setError(null); clearRef(); setDraft({ ...BLANK }); };
  const startEdit = (t: TemplateWithUrl) => {
    setError(null);
    revokeObjectUrl();
    setDraft({
      id: t.id, name: t.name,
      categoryId: t.categoryId,
      aspectW: t.aspectW, aspectH: t.aspectH,
      bakeLongSide: t.bakeLongSide, minSourcePx: t.minSourcePx, silhouetteRef: t.silhouetteRef,
      keypoints: t.keypoints.map((k) => ({ ...k })),
    });
    if (t.silhouetteUrl) {
      setRefUrl(t.silhouetteUrl);
      setRefFile(null);
      setRefTx(t.silhouetteTransform ?? DEFAULT_TX);
    } else {
      setRefUrl(null);
      setRefFile(null);
      setRefTx(DEFAULT_TX);
    }
  };
  const closeEditor = () => { clearRef(); setDraft(null); };

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    revokeObjectUrl();
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setRefUrl(url);
    setRefFile(file);
    setRefSourceUrl(null);
    setRefTx(DEFAULT_TX);
  }, [revokeObjectUrl]);

  const updateKp = useCallback((i: number, patch: Partial<MotifKeypoint>) => {
    setDraft((d) => (d ? { ...d, keypoints: d.keypoints.map((k, j) => (j === i ? { ...k, ...patch } : k)) } : d));
  }, []);

  const onBoxDown = useCallback((e: React.PointerEvent) => {
    // Background press (not on a dot — dots stopPropagation) → start panning the underlay.
    if (!refUrl) return;
    panRef.current = { active: true, startX: e.clientX, startY: e.clientY, offX: refTx.offsetXFrac, offY: refTx.offsetYFrac };
  }, [refUrl, refTx]);

  const onBoxMove = useCallback((e: React.PointerEvent) => {
    if (dragIdx.current !== null && boxRef.current) {
      const r = boxRef.current.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      updateKp(dragIdx.current, { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
      return;
    }
    if (panRef.current.active) {
      const dx = (e.clientX - panRef.current.startX) / previewW;
      const dy = (e.clientY - panRef.current.startY) / previewH;
      setRefTx((t) => ({ ...t, offsetXFrac: panRef.current.offX + dx, offsetYFrac: panRef.current.offY + dy }));
    }
  }, [updateKp, previewW, previewH]);

  const endDrag = useCallback(() => { dragIdx.current = null; panRef.current.active = false; }, []);

  // Wheel-zoom must be a NON-passive native listener — React attaches onWheel as
  // passive, so preventDefault() (to stop page scroll) is a no-op there.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !refUrl) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      setRefTx((t) => {
        const next = Math.min(10, Math.max(0.1, t.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
        // Keep the point under the cursor anchored (exact at rotation 0; close enough otherwise).
        const offXpx = t.offsetXFrac * previewW;
        const offYpx = t.offsetYFrac * previewH;
        const lx = (cx - previewW / 2 - offXpx) / t.scale;
        const ly = (cy - previewH / 2 - offYpx) / t.scale;
        return {
          ...t,
          scale: next,
          offsetXFrac: (offXpx + (t.scale - next) * lx) / previewW,
          offsetYFrac: (offYpx + (t.scale - next) * ly) / previewH,
        };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [refUrl, previewW, previewH]);

  const pinReference = useCallback(async () => {
    if (!refFile && !refSourceUrl) return;
    setPinning(true);
    setError(null);
    try {
      const res = refFile
        ? await fetch("/api/motif-templates/silhouette", { method: "POST", body: (() => { const fd = new FormData(); fd.append("file", refFile); return fd; })() })
        : await fetch("/api/motif-templates/silhouette", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceUrl: refSourceUrl }) });
      if (!res.ok) { setError("Pin failed"); return; }
      const data = (await res.json()) as { key: string; url: string };
      revokeObjectUrl();
      setRefUrl(data.url);
      setRefFile(null);
      setRefSourceUrl(null);
      setDraft((d) => (d ? { ...d, silhouetteRef: data.key } : d));
    } catch {
      setError("Pin failed");
    } finally {
      setPinning(false);
    }
  }, [refFile, refSourceUrl, revokeObjectUrl]);

  const unpin = useCallback(() => {
    setDraft((d) => (d ? { ...d, silhouetteRef: null } : d));
    clearRef();
  }, [clearRef]);

  const save = useCallback(async () => {
    if (!draft) return;
    if (!draft.name.trim()) { setError("Name is required"); return; }
    if (draft.keypoints.length < 2) { setError("At least 2 keypoints are required"); return; }
    if (!draft.categoryId) { setError("Pick a locus category"); return; }
    setSaving(true);
    setError(null);
    const input = {
      name: draft.name.trim(),
      categoryId: draft.categoryId,
      aspectW: draft.aspectW, aspectH: draft.aspectH,
      bakeLongSide: draft.bakeLongSide, minSourcePx: draft.minSourcePx, keypoints: draft.keypoints,
      silhouetteRef: draft.silhouetteRef,
      silhouetteTransform: draft.silhouetteRef ? refTx : null,
    };
    const res = draft.id
      ? await updateMotifTemplateAction(draft.id, input)
      : await createMotifTemplateAction(input);
    setSaving(false);
    if (res.success) { closeEditor(); router.refresh(); }
    else setError(res.error ?? "Save failed");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, refTx, router]);

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
                    {t.categoryId ? `◎ ${t.categoryName ?? "Category"}` : "Unbound"} · {t.aspectW}:{t.aspectH} · {t.bakeLongSide}px · {t.keypoints.length} keypoints{t.silhouetteRef ? " · 📌 ref" : ""}
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
            <button onClick={closeEditor} className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Close"><X size={15} /></button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Fields */}
            <div className="space-y-3">
              <Field label="Name">
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full rounded-md border border-white/15 bg-background/60 px-2 py-1 text-sm" />
              </Field>
              <Field label="Locus category">
                <select
                  value={draft.categoryId ?? ""}
                  onChange={(e) => setDraft({ ...draft, categoryId: e.target.value || null })}
                  className="w-full rounded-md border border-white/15 bg-background/60 px-2 py-1 text-sm"
                >
                  <option value="">— pick a category —</option>
                  {categories.map((c) => {
                    // Disable categories already bound to a different template.
                    const takenByOther = !!c.boundTemplateId && c.boundTemplateId !== draft.id;
                    return (
                      <option key={c.id} value={c.id} disabled={takenByOther}>
                        {c.groupName} › {c.name}{takenByOther ? " (bound)" : ""}
                      </option>
                    );
                  })}
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
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Target keypoints (drag)</p>
                {!refUrl ? (
                  <div className="flex items-center gap-3">
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                      <ImagePlus size={12} /> Upload
                    </button>
                    <button onClick={() => setLibraryOpen(true)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                      <Images size={12} /> Library
                    </button>
                  </div>
                ) : (
                  <button onClick={clearRef} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive">
                    <X size={12} /> Remove image
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) loadFile(e.target.files[0]); e.target.value = ""; }}
                />
              </div>

              <div
                ref={boxRef}
                onPointerDown={onBoxDown}
                onPointerMove={onBoxMove}
                onPointerUp={endDrag}
                onPointerLeave={endDrag}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) loadFile(f); }}
                className={cn(
                  "relative mx-auto overflow-hidden rounded-lg border border-amber-500/40 bg-muted/30",
                  refUrl && "cursor-grab active:cursor-grabbing",
                )}
                style={{ width: previewW, height: previewH, touchAction: refUrl ? "none" : undefined }}
              >
                {/* Reference underlay (behind the dots; ignores pointer events so the box pans) */}
                {refUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={refUrl}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
                    style={{
                      transform: `translate(${refTx.offsetXFrac * previewW}px, ${refTx.offsetYFrac * previewH}px) scale(${refTx.scale}) rotate(${refTx.rotationDeg}deg)`,
                      transformOrigin: "center",
                      opacity: refTx.opacity,
                    }}
                  />
                )}
                {draft.keypoints.map((k, i) => (
                  <div
                    key={i}
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); dragIdx.current = i; }}
                    title={k.name}
                    className="absolute -ml-2 -mt-2 h-4 w-4 cursor-grab rounded-full border-2 border-white bg-amber-500 shadow active:cursor-grabbing"
                    style={{ left: `${k.x * 100}%`, top: `${k.y * 100}%` }}
                  />
                ))}
              </div>

              {/* Reference transform controls */}
              {refUrl && (
                <div className="space-y-2 rounded-lg border border-white/10 bg-background/40 p-2">
                  <Slider label="Opacity" value={Math.round(refTx.opacity * 100)} min={5} max={100} suffix="%"
                    onChange={(v) => setRefTx((t) => ({ ...t, opacity: v / 100 }))} />
                  <div className="flex items-center gap-2">
                    <Slider label="Rotate" value={Math.round(refTx.rotationDeg)} min={-180} max={180} suffix="°"
                      onChange={(v) => setRefTx((t) => ({ ...t, rotationDeg: v }))} />
                    <input type="number" value={Math.round(refTx.rotationDeg)} onChange={(e) => setRefTx((t) => ({ ...t, rotationDeg: Number(e.target.value) }))}
                      className="w-14 rounded border border-white/15 bg-background/60 px-1 py-0.5 text-[11px]" />
                    <button onClick={() => setRefTx(DEFAULT_TX)} title="Reset image transform" className="rounded p-1 text-muted-foreground hover:text-foreground"><RotateCcw size={13} /></button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Drag to move · scroll to zoom · this image is a guide only — it is never saved into the template geometry.</p>
                  <div className="flex items-center gap-2">
                    {refFile || refSourceUrl ? (
                      <button onClick={pinReference} disabled={pinning} className="flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50">
                        <Pin size={12} /> {pinning ? "Pinning…" : "Pin for next time"}
                      </button>
                    ) : draft.silhouetteRef ? (
                      <button onClick={unpin} className="flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] text-muted-foreground hover:text-destructive">
                        <PinOff size={12} /> Unpin
                      </button>
                    ) : null}
                    {draft.silhouetteRef && !refFile && !refSourceUrl && <span className="text-[10px] text-emerald-500">📌 pinned — transform saved on Save</span>}
                  </div>
                </div>
              )}

              {/* Keypoint name list */}
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

      {libraryOpen && (
        <LibraryImagePicker
          title="Pick a reference image"
          onSelect={pickFromLibrary}
          onClose={() => setLibraryOpen(false)}
        />
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

function Slider({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-amber-500" />
      <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{value}{suffix}</span>
    </label>
  );
}
