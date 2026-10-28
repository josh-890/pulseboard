"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { setContactNoteAction } from "@/lib/actions/contact-actions";

type ContactNoteProps = { contactId: string; note: string | null };

export function ContactNote({ contactId, note }: ContactNoteProps) {
  const router = useRouter();
  const [value, setValue] = useState(note ?? "");
  const [isPending, start] = useTransition();
  const dirty = value.trim() !== (note ?? "").trim();

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Your note on her…"
        aria-label="Note"
        rows={3}
        disabled={isPending}
      />
      <Button
        size="sm"
        disabled={!dirty || isPending}
        onClick={() =>
          start(async () => {
            const res = await setContactNoteAction(contactId, value);
            if (!res.success) {
              toast.error(res.error ?? "Could not save the note");
              return;
            }
            toast.success("Note saved");
            router.refresh();
          })
        }
      >
        {isPending && <Loader2 size={14} className="animate-spin" />}
        Save note
      </Button>
    </div>
  );
}
