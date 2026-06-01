"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import type { PhysicalAttributeGroupWithDefinitions } from "@/lib/services/physical-attribute-catalog-service";

type AddPersonSheetProps = {
  attributeGroups?: PhysicalAttributeGroupWithDefinitions[];
};

export function AddPersonSheet({ attributeGroups }: AddPersonSheetProps = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleSubmit(data: CreatePersonInput): Promise<{ fieldErrors?: Record<string, string[]> } | void> {
    const result = await createPerson(data);

    if (result.success) {
      toast.success("Person created");
      router.push(`/people/${result.id}`);
      setOpen(false);
      return;
    }

    if (typeof result.error === "object" && result.error.fieldErrors) {
      return { fieldErrors: result.error.fieldErrors as Record<string, string[]> };
    }

    toast.error(typeof result.error === "string" ? result.error : "Failed to create person");
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus size={16} />
        Add Person
      </Button>
      <SheetContent
        side="right"
        className="flex w-full flex-col sm:max-w-2xl"
      >
        <SheetHeader className="border-b pb-4 px-4">
          <SheetTitle className="text-lg font-semibold">Add Person</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Only Display Name is required. ICG-ID is auto-generated.
          </SheetDescription>
        </SheetHeader>

        <PersonForm
          onSubmit={handleSubmit}
          submitLabel="Create Person"
          onCancel={() => setOpen(false)}
          attributeGroups={attributeGroups}
        />
      </SheetContent>
    </Sheet>
  );
}
