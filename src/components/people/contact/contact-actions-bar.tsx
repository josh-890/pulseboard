"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, FileInput, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ContactLinkPicker } from "@/components/people/contact-link-picker";
import {
  addPersonFromContactAction,
  developContactAction,
  ignoreContactAction,
  linkContactAction,
} from "@/lib/actions/contact-actions";

type ContactActionsBarProps = {
  contactId: string;
  name: string;
  icgId: string | null;
  ignored: boolean;
  /** Her newest catalogue file is stored — Develop imports it, else Add as Person */
  hasCatalogueFile: boolean;
};

/** Develop (or Add as Person without a file), Link… to an existing Person, Ignore / Restore */
export function ContactActionsBar({ contactId, name, icgId, ignored, hasCatalogueFile }: ContactActionsBarProps) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {icgId && hasCatalogueFile && (
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={isPending}
          title="The full import from her newest catalogue file — you review it as usual"
          onClick={() =>
            start(async () => {
              const res = await developContactAction(contactId);
              if (!res.success) {
                toast.error(res.error);
                return;
              }
              toast.success(
                `Import of ${name} ready to review${res.coversWanted ? ` — ${res.coversWanted} covers on the way from the catalogue` : ""}`,
              );
              router.push(`/import/${res.batchId}`);
            })
          }
        >
          <FileInput size={13} /> Develop
        </Button>
      )}
      {icgId && !hasCatalogueFile && (
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={isPending}
          onClick={() =>
            start(async () => {
              const res = await addPersonFromContactAction(contactId);
              if (res.success) {
                toast.success(`Added ${name} as a person`);
                router.push(`/people/${res.id}`);
                return;
              }
              const msg =
                typeof res.error === "string"
                  ? res.error
                  : Object.values(res.error.fieldErrors ?? {})[0]?.[0] ?? "Could not add person";
              toast.error(msg);
            })
          }
        >
          <UserPlus size={13} /> Add as Person
        </Button>
      )}
      <ContactLinkPicker
        disabled={isPending}
        onPick={(personId) =>
          start(async () => {
            const res = await linkContactAction(contactId, personId);
            if (!res.success) {
              toast.error(res.error ?? "Could not link");
              return;
            }
            toast.success(`Linked ${name}`);
            router.push(`/people/${personId}`);
          })
        }
      />
      <Button
        size="sm"
        variant="ghost"
        className="h-8 gap-1.5 text-xs text-muted-foreground"
        disabled={isPending}
        onClick={() =>
          start(async () => {
            const res = await ignoreContactAction(contactId, !ignored);
            if (!res.success) {
              toast.error(res.error ?? "Could not update");
              return;
            }
            toast.success(ignored ? "Contact restored" : "Contact ignored — still enriched");
            router.refresh();
          })
        }
      >
        {ignored ? <Eye size={13} /> : <EyeOff size={13} />}
        {ignored ? "Restore" : "Ignore"}
      </Button>
    </div>
  );
}
