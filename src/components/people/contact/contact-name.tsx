"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renameContactAction } from "@/lib/actions/contact-actions";

type ContactNameProps = {
  contactId: string;
  name: string;
  catalogueName: string | null;
  nameSetByUser: boolean;
};

/** Rename sticks: no catalogue run or import renames her again (ADR-0038) */
export function ContactName({ contactId, name, catalogueName, nameSetByUser }: ContactNameProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [isPending, start] = useTransition();

  function save(next: string | null) {
    start(async () => {
      const res = await renameContactAction(contactId, next);
      if (!res.success) {
        toast.error(res.error ?? "Could not rename");
        return;
      }
      toast.success(next === null ? "Back to the catalogue name" : "Renamed");
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim() && value.trim() !== name) save(value.trim());
          else setEditing(false);
        }}
      >
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          aria-label="Name"
          className="h-9 max-w-xs text-lg font-semibold"
          disabled={isPending}
        />
        <Button type="submit" size="sm" className="h-8" disabled={isPending || !value.trim()} aria-label="Save name">
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)} aria-label="Cancel">
          <X size={14} />
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold leading-tight">{name}</h1>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          onClick={() => {
            setValue(name);
            setEditing(true);
          }}
        >
          <Pencil size={12} /> Rename
        </Button>
      </div>
      {nameSetByUser && catalogueName && catalogueName !== name && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          Your name — her catalogue file says <span className="text-foreground">{catalogueName}</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-1.5 text-xs"
            disabled={isPending}
            onClick={() => save(null)}
          >
            <RotateCcw size={11} /> Use it
          </Button>
        </p>
      )}
    </div>
  );
}
