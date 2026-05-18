"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Check, X, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type ColorCategory,
  HAIR_SHADE_ORDER,
  EYE_SHADE_ORDER,
  SKIN_TONE_ORDER,
  SKIN_UNDERTONE_ORDER,
  getAllHues,
} from "@/lib/constants/color-catalog";
import { createColorCatalogEntryAction } from "@/lib/actions/color-catalog-actions";

type CatalogEntry = {
  value: string;
  display: string;
  hue: string;
  shade: string | null;
  needsReview: boolean;
};

const NONE_SENTINEL = "_none";
const OTHER_SENTINEL = "__other__";

type Props = {
  category: ColorCategory;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
};

export function ColorValueCombobox({ category, value, onChange, placeholder }: Props) {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null);
  const loading = entries === null;

  // Lazy-fetch catalog on mount so we always show the live admin-managed list
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/color-catalog/${category}`)
      .then((r) => r.json())
      .then((d: { entries: CatalogEntry[] }) => {
        if (!cancelled) setEntries(d.entries);
      })
      .catch(() => { if (!cancelled) setEntries([]); });
    return () => { cancelled = true; };
  }, [category]);

  const matched = value
    ? entries?.find((e) => e.value.toLowerCase() === value.toLowerCase())
    : undefined;
  const isOther = value !== undefined && value !== "" && !!entries && !matched;
  const [otherActive, setOtherActive] = useState(isOther);
  const [otherInput, setOtherInput] = useState(isOther ? value! : "");
  const [showAddForm, setShowAddForm] = useState(false);

  const selectValue = !value
    ? NONE_SENTINEL
    : matched
      ? matched.value
      : OTHER_SENTINEL;

  function handleSelectChange(v: string) {
    if (v === NONE_SENTINEL) {
      setOtherActive(false);
      onChange(undefined);
    } else if (v === OTHER_SENTINEL) {
      setOtherActive(true);
      // Don't clear value yet — let the user type
    } else {
      setOtherActive(false);
      setShowAddForm(false);
      onChange(v);
    }
  }

  function handleOtherChange(v: string) {
    setOtherInput(v);
    onChange(v || undefined);
  }

  if (loading) {
    return <Input disabled placeholder="Loading catalog…" className="h-9 text-sm" />;
  }

  return (
    <div className="space-y-1.5">
      <Select value={selectValue} onValueChange={handleSelectChange}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder={placeholder ?? "Select…"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_SENTINEL}>—</SelectItem>
          {entries?.map((e) => (
            <SelectItem key={e.value} value={e.value}>
              <span className="flex items-center gap-2">
                <span>{e.display}</span>
                <span className="text-[10px] text-muted-foreground">{e.hue}{e.shade ? ` · ${e.shade}` : ""}</span>
                {e.needsReview && <AlertTriangle size={10} className="text-amber-500" />}
              </span>
            </SelectItem>
          ))}
          <SelectItem value={OTHER_SENTINEL}>Other…</SelectItem>
        </SelectContent>
      </Select>

      {(otherActive || isOther) && (
        <div className="space-y-1.5">
          <Input
            value={otherInput}
            onChange={(e) => handleOtherChange(e.target.value)}
            placeholder="Type a value…"
            className="h-9 text-sm"
          />
          {otherInput && !entries?.some((e) => e.value.toLowerCase() === otherInput.toLowerCase()) && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="flex w-full items-center gap-1.5 rounded-md border border-blue-500/30 bg-blue-500/5 px-2 py-1 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-500/10"
            >
              <Plus size={12} />
              Add &ldquo;{otherInput}&rdquo; to catalog
            </button>
          )}
          {showAddForm && (
            <AddToCatalogForm
              category={category}
              value={otherInput}
              onCancel={() => setShowAddForm(false)}
              onAdded={(newValue) => {
                setShowAddForm(false);
                setOtherActive(false);
                onChange(newValue);
                // Re-fetch catalog so the newly-added entry appears in the dropdown
                fetch(`/api/color-catalog/${category}`)
                  .then((r) => r.json())
                  .then((d: { entries: CatalogEntry[] }) => setEntries(d.entries))
                  .catch(() => {});
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function AddToCatalogForm({
  category,
  value,
  onCancel,
  onAdded,
}: {
  category: ColorCategory;
  value: string;
  onCancel: () => void;
  onAdded: (newValue: string) => void;
}) {
  const primaryOptions = category === "skin" ? SKIN_TONE_ORDER : getAllHues(category);
  const secondaryOptions =
    category === "hair" ? HAIR_SHADE_ORDER :
    category === "eye"  ? EYE_SHADE_ORDER :
                          SKIN_UNDERTONE_ORDER;

  const [hue, setHue] = useState(primaryOptions[0]);
  const [shade, setShade] = useState<string>(secondaryOptions[Math.floor(secondaryOptions.length / 2)]);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const shadeRankFor = (s: string): number | null => {
    switch (category) {
      case "hair": return HAIR_SHADE_ORDER.indexOf(s as typeof HAIR_SHADE_ORDER[number]) + 1 || null;
      case "eye":  return EYE_SHADE_ORDER.indexOf(s as typeof EYE_SHADE_ORDER[number]) + 1 || null;
      case "skin": return SKIN_TONE_ORDER.indexOf(hue as typeof SKIN_TONE_ORDER[number]) + 1 || null;
    }
  };

  const submit = () => {
    setBusy(true);
    startTransition(async () => {
      const r = await createColorCatalogEntryAction(category, {
        value,
        hue,
        shade,
        shadeRank: shadeRankFor(shade),
      });
      setBusy(false);
      if (r.success && r.valueNorm) {
        onAdded(r.valueNorm);
      } else {
        alert(r.error ?? "Failed to add value");
      }
    });
  };

  const primaryLabel = category === "skin" ? "Tone" : "Hue";
  const secondaryLabel = category === "skin" ? "Undertone" : "Shade";

  return (
    <div className="space-y-2 rounded-md border border-blue-500/20 bg-blue-500/[0.04] p-2">
      <div className="text-[11px] text-muted-foreground">
        Classify <span className="font-medium text-foreground">{value}</span> so it can be filtered
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className="text-[10px] text-muted-foreground">{primaryLabel}</label>
          <select
            value={hue}
            onChange={(e) => setHue(e.target.value)}
            className="h-8 w-full rounded border border-white/10 bg-background text-xs px-1.5"
          >
            {primaryOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">{secondaryLabel}</label>
          <select
            value={shade}
            onChange={(e) => setShade(e.target.value)}
            className="h-8 w-full rounded border border-white/10 bg-background text-xs px-1.5"
          >
            {secondaryOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy} className="h-7 gap-1 text-xs">
          <X size={11} /> Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={busy} className="h-7 gap-1 text-xs">
          <Check size={11} /> Add
        </Button>
      </div>
    </div>
  );
}
