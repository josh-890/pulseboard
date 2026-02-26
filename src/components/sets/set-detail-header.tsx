"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { InlineEditable } from "@/components/shared/inline-editable";
import { updateSetField } from "@/lib/actions/set-actions";

export function SetInlineTitle({ setId, title }: { setId: string; title: string }) {
  const router = useRouter();

  async function handleSave(newValue: string) {
    const result = await updateSetField(setId, "title", newValue);
    if (!result.success) {
      toast.error(result.error ?? "Failed to update title");
      throw new Error(result.error ?? "Failed");
    }
    router.refresh();
  }

  return (
    <InlineEditable
      value={title}
      onSave={handleSave}
      placeholder="Set title…"
      inputClassName="text-2xl font-bold"
    >
      <h1 className="text-2xl font-bold leading-tight">{title}</h1>
    </InlineEditable>
  );
}

export function SetInlineDescription({ setId, description }: { setId: string; description: string | null }) {
  const router = useRouter();

  async function handleSave(newValue: string) {
    const result = await updateSetField(setId, "description", newValue);
    if (!result.success) {
      toast.error(result.error ?? "Failed to update description");
      throw new Error(result.error ?? "Failed");
    }
    router.refresh();
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Description
      </p>
      <InlineEditable
        value={description ?? ""}
        onSave={handleSave}
        type="textarea"
        placeholder="Add a description…"
        inputClassName="text-sm"
      >
        {description ? (
          <p className="text-sm leading-relaxed text-foreground/90">
            {description}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground/50 italic">
            Click to add description…
          </p>
        )}
      </InlineEditable>
    </div>
  );
}

export function SetInlineNotes({ setId, notes }: { setId: string; notes: string | null }) {
  const router = useRouter();

  async function handleSave(newValue: string) {
    const result = await updateSetField(setId, "notes", newValue);
    if (!result.success) {
      toast.error(result.error ?? "Failed to update notes");
      throw new Error(result.error ?? "Failed");
    }
    router.refresh();
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Notes
      </p>
      <InlineEditable
        value={notes ?? ""}
        onSave={handleSave}
        type="textarea"
        placeholder="Add notes…"
        inputClassName="text-sm"
      >
        {notes ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {notes}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground/50 italic">
            Click to add notes…
          </p>
        )}
      </InlineEditable>
    </div>
  );
}
