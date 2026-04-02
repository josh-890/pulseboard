"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, ExternalLink, Check, X, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionCard, EmptyState } from "@/components/people/person-detail-helpers";
import {
  createDigitalIdentityAction,
  updateDigitalIdentityAction,
  deleteDigitalIdentityAction,
} from "@/lib/actions/digital-identity-actions";
import type { PersonDigitalIdentityItem, DigitalIdentityStatus } from "@/lib/types";

type DigitalIdentitySectionProps = {
  personId: string;
  identities: PersonDigitalIdentityItem[];
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  inactive: "bg-slate-500/15 text-slate-500 border-slate-500/30",
  suspended: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  deleted: "bg-red-500/15 text-red-500 border-red-500/30",
};

const STATUS_OPTIONS: { value: DigitalIdentityStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
  { value: "deleted", label: "Deleted" },
];

type FormState = {
  platform: string;
  handle: string;
  url: string;
  status: DigitalIdentityStatus;
};

const EMPTY_FORM: FormState = { platform: "", handle: "", url: "", status: "active" };

export function DigitalIdentitySection({ personId, identities }: DigitalIdentitySectionProps) {
  const [isPending, startTransition] = useTransition();
  const [addingNew, setAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function startAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setAddingNew(true);
  }

  function startEdit(identity: PersonDigitalIdentityItem) {
    setAddingNew(false);
    setEditingId(identity.id);
    setForm({
      platform: identity.platform,
      handle: identity.handle ?? "",
      url: identity.url ?? "",
      status: identity.status,
    });
  }

  function cancel() {
    setAddingNew(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSave() {
    if (!form.platform.trim()) return;

    startTransition(async () => {
      if (addingNew) {
        const result = await createDigitalIdentityAction({
          personId,
          platform: form.platform.trim(),
          handle: form.handle.trim() || undefined,
          url: form.url.trim() || undefined,
          status: form.status,
        });
        if (result.success) cancel();
      } else if (editingId) {
        const result = await updateDigitalIdentityAction(
          {
            id: editingId,
            platform: form.platform.trim(),
            handle: form.handle.trim() || undefined,
            url: form.url.trim() || undefined,
            status: form.status,
          },
          personId,
        );
        if (result.success) cancel();
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteDigitalIdentityAction(id, personId);
    });
  }

  const activeCount = identities.filter((i) => i.status === "active").length;

  return (
    <SectionCard
      title="Digital Identities"
      icon={<Cpu size={18} />}
      badge={activeCount}
      action={
        !addingNew && !editingId ? (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={startAdd}>
            <Plus size={14} />
          </Button>
        ) : null
      }
    >
      <div className="space-y-2">
        {identities.length === 0 && !addingNew && (
          <EmptyState message="No digital identities recorded." />
        )}

        {identities.map((identity) =>
          editingId === identity.id ? (
            <IdentityForm
              key={identity.id}
              form={form}
              setForm={setForm}
              onSave={handleSave}
              onCancel={cancel}
              isPending={isPending}
            />
          ) : (
            <IdentityRow
              key={identity.id}
              identity={identity}
              onEdit={() => startEdit(identity)}
              onDelete={() => handleDelete(identity.id)}
              disabled={isPending}
            />
          ),
        )}

        {addingNew && (
          <IdentityForm
            form={form}
            setForm={setForm}
            onSave={handleSave}
            onCancel={cancel}
            isPending={isPending}
          />
        )}
      </div>
    </SectionCard>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function IdentityRow({
  identity,
  onEdit,
  onDelete,
  disabled,
}: {
  identity: PersonDigitalIdentityItem;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const statusStyle = STATUS_STYLES[identity.status] ?? STATUS_STYLES.inactive;

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-white/10 bg-card/40 px-4 py-3">
      <div className="w-24 shrink-0 text-sm font-medium text-foreground/80">
        {identity.platform}
      </div>

      <div className="min-w-0 flex-1">
        {identity.handle && (
          <p className="truncate text-sm font-medium">{identity.handle}</p>
        )}
        {identity.url && (
          <a
            href={identity.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {identity.url}
            <ExternalLink size={10} className="shrink-0" />
          </a>
        )}
        {!identity.handle && !identity.url && (
          <span className="text-xs text-muted-foreground/50 italic">No details</span>
        )}
      </div>

      <span
        className={cn(
          "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
          statusStyle,
        )}
      >
        {identity.status}
      </span>

      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={onEdit}
          disabled={disabled}
        >
          <Pencil size={12} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          disabled={disabled}
        >
          <Trash2 size={12} />
        </Button>
      </div>
    </div>
  );
}

// ── Inline Form ──────────────────────────────────────────────────────────────

function IdentityForm({
  form,
  setForm,
  onSave,
  onCancel,
  isPending,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-card/60 px-4 py-3">
      <Input
        placeholder="Platform"
        value={form.platform}
        onChange={(e) => setForm({ ...form, platform: e.target.value })}
        className="h-8 w-28 text-sm"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
          if (e.key === "Escape") onCancel();
        }}
      />
      <Input
        placeholder="Handle"
        value={form.handle}
        onChange={(e) => setForm({ ...form, handle: e.target.value })}
        className="h-8 w-32 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
          if (e.key === "Escape") onCancel();
        }}
      />
      <Input
        placeholder="URL"
        value={form.url}
        onChange={(e) => setForm({ ...form, url: e.target.value })}
        className="h-8 min-w-0 flex-1 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
          if (e.key === "Escape") onCancel();
        }}
      />
      <Select
        value={form.status}
        onValueChange={(v) => setForm({ ...form, status: v as DigitalIdentityStatus })}
      >
        <SelectTrigger className="h-8 w-28 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-emerald-500 hover:text-emerald-400"
          onClick={onSave}
          disabled={isPending || !form.platform.trim()}
        >
          <Check size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={onCancel}
          disabled={isPending}
        >
          <X size={14} />
        </Button>
      </div>
    </div>
  );
}
