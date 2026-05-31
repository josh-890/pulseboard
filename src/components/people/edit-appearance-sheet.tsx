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
import { ColorValueCombobox } from "@/components/people/color-value-combobox";
import { CoreFieldRow } from "@/components/people/core-field-row";
import {
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

  const baselineEra = person.eras.find((p) => p.isBaseline);
  const baselineDeltaValue = (defId: string) =>
    baselineEra?.scalarDeltas.find(
      (d) => d.attributeDefinitionId === defId && d.value.trim() !== "",
    )?.value ?? null;
  // Slice 16 follow-up: surface verified-unknown deltas (value="", flag=true)
  // so the form initialises with the right unknown state per field.
  const baselineDeltaUnknown = (defId: string) =>
    baselineEra?.scalarDeltas.some(
      (d) => d.attributeDefinitionId === defId && d.isVerifiedUnknown,
    ) ?? false;
  const weightValue = baselineDeltaValue("cattr-weight");
  const heightValue = baselineDeltaValue("cattr-height");

  const getDefaults = (): UpdateAppearanceFormValues => ({
    id: person.id,
    // Eye color + height migrated off Person.eyeColor / Person.height in
    // Slice 3a — read the baseline deltas so the form reflects what we
    // actually persist. (Person.height stays in the schema for now but is
    // no longer written by createPersonRecord, so reading it would show
    // empty for every post-Slice-3a person.)
    eyeColor: baselineDeltaValue("cattr-eye-color") ?? "",
    measurements: baselineDeltaValue("cattr-measurements") ?? "",
    height: heightValue ? Number(heightValue) : undefined,
    weight: weightValue ? Number(weightValue) : undefined,
    build: baselineDeltaValue("cattr-build") ?? undefined,
    currentHairColor: baselineDeltaValue("cattr-hair-color") ?? "",
    breastSize: baselineDeltaValue("cattr-breast-size") ?? "",
    eyeColorUnknown: baselineDeltaUnknown("cattr-eye-color"),
    hairColorUnknown: baselineDeltaUnknown("cattr-hair-color"),
    weightUnknown: baselineDeltaUnknown("cattr-weight"),
    heightUnknown: baselineDeltaUnknown("cattr-height"),
    buildUnknown: baselineDeltaUnknown("cattr-build"),
    breastSizeUnknown: baselineDeltaUnknown("cattr-breast-size"),
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
                {/* Slice 16 follow-up: every Tier 1 field gets a "don't know"
                    affordance via CoreFieldRow. Measurements is Tier 2 — stays plain.
                    react-hook-form's `form.watch()` is known incompatible with
                    React Compiler — disables sit on each `.watch()` line below. */}
                {/* eslint-disable react-hooks/incompatible-library */}
                <div className="grid grid-cols-2 gap-3">
                  <CoreFieldRow
                    label="Eye Color"
                    unknown={form.watch("eyeColorUnknown") ?? false}
                    onUnknownChange={(v) => {
                      form.setValue("eyeColorUnknown", v);
                      if (v) form.setValue("eyeColor", "");
                    }}
                  >
                    <FormField
                      control={form.control}
                      name="eyeColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <ColorValueCombobox
                              category="eye"
                              value={field.value || undefined}
                              onChange={(v) => field.onChange(v ?? "")}
                              placeholder="Select eye color…"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CoreFieldRow>

                  <CoreFieldRow
                    label="Breast Size"
                    unknown={form.watch("breastSizeUnknown") ?? false}
                    onUnknownChange={(v) => {
                      form.setValue("breastSizeUnknown", v);
                      if (v) form.setValue("breastSize", "");
                    }}
                  >
                    <FormField
                      control={form.control}
                      name="breastSize"
                      render={({ field }) => (
                        <FormItem>
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
                  </CoreFieldRow>

                  <FormField
                    control={form.control}
                    name="measurements"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Measurements (cm)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. 90-60-90"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <CoreFieldRow
                    label="Height (cm)"
                    unknown={form.watch("heightUnknown") ?? false}
                    onUnknownChange={(v) => {
                      form.setValue("heightUnknown", v);
                      if (v) form.setValue("height", undefined);
                    }}
                  >
                    <FormField
                      control={form.control}
                      name="height"
                      render={({ field }) => (
                        <FormItem>
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
                  </CoreFieldRow>

                  <CoreFieldRow
                    label="Weight (kg)"
                    unknown={form.watch("weightUnknown") ?? false}
                    onUnknownChange={(v) => {
                      form.setValue("weightUnknown", v);
                      if (v) form.setValue("weight", undefined);
                    }}
                  >
                    <FormField
                      control={form.control}
                      name="weight"
                      render={({ field }) => (
                        <FormItem>
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
                  </CoreFieldRow>

                  <CoreFieldRow
                    label="Build"
                    unknown={form.watch("buildUnknown") ?? false}
                    onUnknownChange={(v) => {
                      form.setValue("buildUnknown", v);
                      if (v) form.setValue("build", undefined);
                    }}
                  >
                    <FormField
                      control={form.control}
                      name="build"
                      render={({ field }) => (
                        <FormItem>
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
                  </CoreFieldRow>

                  <CoreFieldRow
                    label="Hair Color"
                    unknown={form.watch("hairColorUnknown") ?? false}
                    onUnknownChange={(v) => {
                      form.setValue("hairColorUnknown", v);
                      if (v) form.setValue("currentHairColor", "");
                    }}
                  >
                    <FormField
                      control={form.control}
                      name="currentHairColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <ColorValueCombobox
                              category="hair"
                              value={field.value || undefined}
                              onChange={(v) => field.onChange(v ?? "")}
                              placeholder="Select hair color…"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CoreFieldRow>

                </div>
                {/* eslint-enable react-hooks/incompatible-library */}
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
