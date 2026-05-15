"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  updateAppearanceSchema,
  type UpdateAppearanceFormValues,
  type UpdateAppearanceInput,
} from "@/lib/validations/person";
import { updatePersonAppearanceAction } from "@/lib/actions/person-actions";
import { SelectWithOther } from "@/components/shared/select-with-other";
import {
  EYE_COLOR_OPTIONS,
  NATURAL_HAIR_COLOR_OPTIONS,
  CURRENT_HAIR_COLOR_OPTIONS,
  BUILD_OPTIONS,
  BREAST_SIZE_OPTIONS,
} from "@/lib/constants/appearance";
import type { getPersonWithDetails } from "@/lib/services/person-service";

type PersonDetail = NonNullable<Awaited<ReturnType<typeof getPersonWithDetails>>>;

type EditAppearanceSheetProps = {
  person: PersonDetail;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-0.5 rounded-full bg-primary" />
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
    </div>
  );
}

export function EditAppearanceSheet({ person, open: controlledOpen, onOpenChange }: EditAppearanceSheetProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? (controlledOpen ?? false) : internalOpen;

  function handleClose() {
    if (isControlled) onOpenChange?.(false);
    else setInternalOpen(false);
  }

  const baselinePersona = person.personas.find((p) => p.isBaseline);
  const physical = baselinePersona?.physicalChange;

  const getDefaults = (): UpdateAppearanceFormValues => ({
    id: person.id,
    eyeColor: person.eyeColor ?? "",
    naturalHairColor: person.naturalHairColor ?? "",
    naturalBreastSize: person.naturalBreastSize ?? "",
    height: person.height ?? undefined,
    weight: physical?.weight ?? undefined,
    build: physical?.build ?? undefined,
    currentHairColor: physical?.currentHairColor ?? "",
  });

  const form = useForm<UpdateAppearanceFormValues, unknown, UpdateAppearanceInput>({
    resolver: zodResolver(updateAppearanceSchema),
    defaultValues: getDefaults(),
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: UpdateAppearanceInput) {
    const result = await updatePersonAppearanceAction(values);

    if (result.success) {
      toast.success("Appearance updated");
      handleClose();
      router.refresh();
      return;
    }

    if (typeof result.error === "object" && "fieldErrors" in result.error) {
      const fieldErrors = result.error.fieldErrors as Record<string, string[]>;
      for (const [field, messages] of Object.entries(fieldErrors)) {
        form.setError(field as keyof UpdateAppearanceInput, { message: messages[0] });
      }
      return;
    }

    toast.error(typeof result.error === "string" ? result.error : "Failed to update appearance");
  }

  return (
    <Sheet open={open} onOpenChange={(v) => {
      if (isControlled) onOpenChange?.(v);
      else setInternalOpen(v);
      if (v) form.reset(getDefaults());
    }}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="border-b pb-4 px-4">
          <SheetTitle className="text-lg font-semibold">Edit Appearance</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Changes apply when you click Save.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <section className="rounded-xl border bg-muted/30 dark:bg-muted/20 p-4 space-y-4">
                <SectionHeader>Appearance</SectionHeader>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="eyeColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Eye Color</FormLabel>
                        <FormControl>
                          <SelectWithOther
                            options={EYE_COLOR_OPTIONS}
                            value={field.value || undefined}
                            onChange={(v) => field.onChange(v ?? "")}
                            placeholder="Select eye color…"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="naturalHairColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Natural Hair Color</FormLabel>
                        <FormControl>
                          <SelectWithOther
                            options={NATURAL_HAIR_COLOR_OPTIONS}
                            value={field.value || undefined}
                            onChange={(v) => field.onChange(v ?? "")}
                            placeholder="Select hair color…"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="naturalBreastSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Natural Breast Size</FormLabel>
                        <FormControl>
                          <SelectWithOther
                            options={BREAST_SIZE_OPTIONS}
                            value={field.value || undefined}
                            onChange={(v) => field.onChange(v ?? "")}
                            placeholder="Select cup size…"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="height"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Height (cm)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="e.g. 170"
                            {...field}
                            value={(field.value as number | undefined) ?? ""}
                            onChange={(e) =>
                              field.onChange(e.target.value === "" ? undefined : e.target.value)
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="weight"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Weight (kg)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="e.g. 65"
                            {...field}
                            value={(field.value as number | undefined) ?? ""}
                            onChange={(e) =>
                              field.onChange(e.target.value === "" ? undefined : e.target.value)
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="build"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Build</FormLabel>
                        <FormControl>
                          <SelectWithOther
                            options={BUILD_OPTIONS}
                            value={field.value || undefined}
                            onChange={(v) => field.onChange(v ?? "")}
                            placeholder="Select build…"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="currentHairColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current Hair Color</FormLabel>
                        <FormControl>
                          <SelectWithOther
                            options={CURRENT_HAIR_COLOR_OPTIONS}
                            value={field.value || undefined}
                            onChange={(v) => field.onChange(v ?? "")}
                            placeholder="Select hair color…"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>
            </div>

            <SheetFooter className="border-t px-4 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save Changes"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
