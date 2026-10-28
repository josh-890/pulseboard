"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ContactLinkPicker } from "@/components/people/contact-link-picker";
import {
  addPersonFromContactAction,
  ignoreContactAction,
  linkContactAction,
} from "@/lib/actions/contact-actions";

type ContactActionsBarProps = {
  contactId: string;
  name: string;
  icgId: string | null;
  ignored: boolean;
};

/** Develop (Add as Person), Link… to an existing Person, Ignore / Restore */
export function ContactActionsBar({ contactId, name, icgId, ignored }: ContactActionsBarProps) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {icgId && (
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
