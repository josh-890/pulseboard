"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  createColorCatalogEntryAction,
  updateColorCatalogEntryAction,
  deleteColorCatalogEntryAction,
} from "@/lib/actions/color-catalog-actions";
import type { ColorCatalogEntryRecord } from "@/lib/services/color-catalog-service";
import {
  type ColorCategory,
  HAIR_LIGHTNESS_ORDER,
  EYE_LIGHTNESS_ORDER,
  SKIN_TONE_ORDER,
  SKIN_UNDERTONE_ORDER,
  getAllHues,
} from "@/lib/constants/color-catalog";

type Props = {
  hair: ColorCatalogEntryRecord[];
  eye: ColorCatalogEntryRecord[];
  skin: ColorCatalogEntryRecord[];
};

const SECONDARY_AXIS_LABEL: Record<ColorCategory, string> = {
  // Hair/eye lightness is ABSOLUTE — same scale across hues. Skin's secondary
  // axis is undertone (Cool/Warm/Neutral), orthogonal to tone.
  hair: "Lightness",
  eye: "Lightness",
  skin: "Undertone",
};

const PRIMARY_AXIS_LABEL: Record<ColorCategory, string> = {
  hair: "Hue",
  eye: "Hue",
  skin: "Tone",
};

function axisOptions(category: ColorCategory, axis: "primary" | "secondary"): readonly string[] {
  if (axis === "primary") return getAllHues(category);
  switch (category) {
    case "hair": return HAIR_LIGHTNESS_ORDER;
    case "eye":  return EYE_LIGHTNESS_ORDER;
    case "skin": return SKIN_UNDERTONE_ORDER;
  }
}

function primaryOrderFor(category: ColorCategory): readonly string[] {
  return category === "skin" ? SKIN_TONE_ORDER : getAllHues(category);
}

type ReviewFilter = "all" | "needs_review" | "seed" | "import_auto";

export function ColorCatalogManager({ hair, eye, skin }: Props) {
  const [tab, setTab] = useState<ColorCategory>("hair");
  const data: Record<ColorCategory, ColorCatalogEntryRecord[]> = { hair, eye, skin };

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as ColorCategory)}>
      <TabsList className="grid w-fit grid-cols-3">
        <TabsTrigger value="hair">Hair</TabsTrigger>
        <TabsTrigger value="eye">Eye</TabsTrigger>
        <TabsTrigger value="skin">Skin</TabsTrigger>
      </TabsList>
      {(["hair", "eye", "skin"] as ColorCategory[]).map((cat) => (
        <TabsContent key={cat} value={cat} className="mt-4">
          <CategoryTable category={cat} entries={data[cat]} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function CategoryTable({
  category,
  entries,
}: {
  category: ColorCategory;
  entries: ColorCatalogEntryRecord[];
}) {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [editingValueNorm, setEditingValueNorm] = useState<string | null>(null);
  const [addingOpen, setAddingOpen] = useState(false);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    switch (filter) {
      case "needs_review": return entries.filter((e) => e.needsReview);
      case "seed":         return entries.filter((e) => e.source === "seed");
      case "import_auto":  return entries.filter((e) => e.source === "import_auto");
      default:             return entries;
    }
  }, [entries, filter]);

  const needsReviewCount = entries.filter((e) => e.needsReview).length;

  const handleDelete = (valueNorm: string) => {
    if (!confirm(`Delete "${valueNorm}" from the ${category} catalog?`)) return;
    startTransition(async () => {
      const r = await deleteColorCatalogEntryAction(category, valueNorm);
      if (!r.success) alert(r.error ?? "Failed");
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs">
          {(["all", "needs_review", "seed", "import_auto"] as ReviewFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-2 py-1",
                filter === f
                  ? "border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300"
                  : "border-white/10 text-muted-foreground hover:bg-white/5",
              )}
            >
              {f === "all" ? "All" :
               f === "needs_review" ? `Needs review${needsReviewCount > 0 ? ` (${needsReviewCount})` : ""}` :
               f === "seed" ? "Seed only" :
               "Auto-imported"}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setAddingOpen(true)} className="gap-1">
          <Plus size={14} />
          Add value
        </Button>
      </div>

      {addingOpen && (
        <EntryForm
          category={category}
          onCancel={() => setAddingOpen(false)}
          onDone={() => setAddingOpen(false)}
        />
      )}

      <div className="rounded-lg border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="w-8 px-2 py-2"></th>
              <th className="px-2 py-2">Value</th>
              <th className="px-2 py-2">Display</th>
              <th className="px-2 py-2">{PRIMARY_AXIS_LABEL[category]}</th>
              <th className="px-2 py-2">{SECONDARY_AXIS_LABEL[category]}</th>
              <th className="px-2 py-2">Source</th>
              <th className="w-20 px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No entries match this filter.
                </td>
              </tr>
            )}
            {filtered.map((entry) =>
              editingValueNorm === entry.valueNorm ? (
                <tr key={entry.valueNorm} className="bg-white/5">
                  <td colSpan={7} className="p-2">
                    <EntryForm
                      category={category}
                      initial={entry}
                      onCancel={() => setEditingValueNorm(null)}
                      onDone={() => setEditingValueNorm(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={entry.valueNorm} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-2 py-1.5 text-center">
                    {entry.needsReview && (
                      <AlertTriangle size={12} className="inline text-amber-500" />
                    )}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs">{entry.valueNorm}</td>
                  <td className="px-2 py-1.5">{entry.display}</td>
                  <td className="px-2 py-1.5 text-xs">{entry.hue}</td>
                  <td className="px-2 py-1.5 text-xs">{entry.shade ?? "—"}</td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground">{entry.source}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingValueNorm(entry.valueNorm)}
                      className="mr-1 text-muted-foreground hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.valueNorm)}
                      className="text-muted-foreground hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EntryForm({
  category,
  initial,
  onCancel,
  onDone,
}: {
  category: ColorCategory;
  initial?: ColorCatalogEntryRecord;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState(initial?.valueNorm ?? "");
  const [display, setDisplay] = useState(initial?.display ?? "");
  const [hue, setHue] = useState<string>(initial?.hue ?? primaryOrderFor(category)[0]);
  const [shade, setShade] = useState<string>(
    initial?.shade ?? axisOptions(category, "secondary")[0],
  );
  const [busy, setBusy] = useState(false);
  const isEditing = !!initial;

  const primaryOptions = primaryOrderFor(category);
  const secondaryOptions = axisOptions(category, "secondary");

  const shadeRankFor = (cat: ColorCategory, s: string): number | null => {
    switch (cat) {
      case "hair": return HAIR_LIGHTNESS_ORDER.indexOf(s as typeof HAIR_LIGHTNESS_ORDER[number]) + 1 || null;
      case "eye":  return EYE_LIGHTNESS_ORDER.indexOf(s as typeof EYE_LIGHTNESS_ORDER[number]) + 1 || null;
      case "skin": return SKIN_TONE_ORDER.indexOf(hue as typeof SKIN_TONE_ORDER[number]) + 1 || null;
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const r = isEditing
        ? await updateColorCatalogEntryAction(category, initial!.valueNorm, {
            display,
            hue,
            shade,
            shadeRank: shadeRankFor(category, shade),
          })
        : await createColorCatalogEntryAction(category, {
            value,
            display: display || undefined,
            hue,
            shade,
            shadeRank: shadeRankFor(category, shade),
          });
      if (!r.success) alert(r.error ?? "Failed");
      else onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-white/10 bg-card/40 p-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-muted-foreground">Value (canonical, lowercase)</label>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={isEditing}
            placeholder="e.g. dark brown"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">Display</label>
          <Input
            value={display}
            onChange={(e) => setDisplay(e.target.value)}
            placeholder="Auto from Value if blank"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">{PRIMARY_AXIS_LABEL[category]}</label>
          <select
            value={hue}
            onChange={(e) => setHue(e.target.value)}
            className="h-8 w-full rounded-md border border-white/10 bg-background text-sm px-2"
          >
            {primaryOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">{SECONDARY_AXIS_LABEL[category]}</label>
          <select
            value={shade}
            onChange={(e) => setShade(e.target.value)}
            className="h-8 w-full rounded-md border border-white/10 bg-background text-sm px-2"
          >
            {secondaryOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-1 pt-1">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy} className="gap-1">
          <X size={12} /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={busy || (!isEditing && !value.trim())} className="gap-1">
          <Check size={12} /> {isEditing ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}
