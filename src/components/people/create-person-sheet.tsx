"use client";

import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { createPerson } from "@/lib/actions/person-actions";
import { PersonForm } from "@/components/people/person-form";
import type { CreatePersonInput } from "@/lib/validations/person";

type CreatePersonSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (person: { id: string; name: string }) => void;
};

export function CreatePersonSheet({ open, onOpenChange, onCreated }: CreatePersonSheetProps) {
  async function handleSubmit(data: CreatePersonInput): Promise<{ fieldErrors?: Record<string, string[]> } | void> {
    const result = await createPerson(data);

    if (result.success) {
      toast.success("Person created");
      onCreated({ id: result.id, name: data.commonName });
      onOpenChange(false);
      return;
    }

    if (typeof result.error === "object" && result.error.fieldErrors) {
      return { fieldErrors: result.error.fieldErrors as Record<string, string[]> };
    }

    toast.error(typeof result.error === "string" ? result.error : "Failed to create person");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col sm:max-w-2xl"
      >
        <SheetHeader className="border-b pb-4 px-4">
          <SheetTitle className="text-lg font-semibold">Create Person</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Only Display Name is required. ICG-ID is auto-generated.
          </SheetDescription>
        </SheetHeader>

        <PersonForm
          onSubmit={handleSubmit}
          submitLabel="Create Person"
          onCancel={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
