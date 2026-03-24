"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updatePersonSchema,
  type UpdatePersonFormValues,
  type UpdatePersonInput,
} from "@/lib/validations/person";
import { ETHNICITY_OPTIONS } from "@/lib/constants/ethnicity";
import { CountryPicker } from "@/components/shared/country-picker";
import { updatePerson } from "@/lib/actions/person-actions";
import { PartialDateInput } from "@/components/shared/partial-date-input";
import { SelectWithOther } from "@/components/shared/select-with-other";
import {
  EYE_COLOR_OPTIONS,
  NATURAL_HAIR_COLOR_OPTIONS,
  CURRENT_HAIR_COLOR_OPTIONS,
  BUILD_OPTIONS,
} from "@/lib/constants/appearance";
import type { getPersonWithDetails } from "@/lib/services/person-service";

type PersonDetail = NonNullable<Awaited<ReturnType<typeof getPersonWithDetails>>>;

type EditPersonSheetProps = {
  person: PersonDetail;
};

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-0.5 rounded-full bg-primary" />
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
    </div>
  );
}

export function EditPersonSheet({ person }: EditPersonSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const commonAlias = person.aliases.find((a) => a.type === "common");
  const baselinePersona = person.personas.find((p) => p.isBaseline);
  const physical = baselinePersona?.physicalChange;

  const getDefaults = (): UpdatePersonFormValues => ({
    id: person.id,
    commonName: commonAlias?.name ?? "",
    status: person.status,
    sexAtBirth: (person.sexAtBirth as "male" | "female" | undefined) ?? undefined,
    birthdate: person.birthdate
      ? person.birthdate.toISOString().slice(0, 10)
      : "",
    birthdatePrecision: (person.birthdatePrecision as "UNKNOWN" | "YEAR" | "MONTH" | "DAY") ?? "UNKNOWN",
    birthPlace: person.birthPlace ?? "",
    nationality: person.nationality ?? "",
    ethnicity: person.ethnicity ?? undefined,
    eyeColor: person.eyeColor ?? "",
    naturalHairColor: person.naturalHairColor ?? "",
    height: person.height ?? undefined,
    location: person.location ?? "",
    notes: person.notes ?? "",
    activeSince: person.activeSince ?? undefined,
    retiredIn: person.retiredIn ?? undefined,
    specialization: person.specialization ?? "",
    rating: person.rating ?? undefined,
    pgrade: person.pgrade ?? undefined,
    weight: physical?.weight ?? undefined,
    build: physical?.build ?? undefined,
    currentHairColor: physical?.currentHairColor ?? "",
  });

  const form = useForm<UpdatePersonFormValues, unknown, UpdatePersonInput>({
    resolver: zodResolver(updatePersonSchema),
    defaultValues: getDefaults(),
  });

  const { isSubmitting } = form.formState;

  async function onSubmit(values: UpdatePersonInput) {
    const result = await updatePerson(values);

    if (result.success) {
      toast.success("Person updated");
      setOpen(false);
      router.refresh();
      return;
    }

    toast.error(typeof result.error === "string" ? result.error : "Failed to update person");
  }

  return (
    <Sheet open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v) form.reset(getDefaults());
    }}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil size={16} />
        Edit
      </Button>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-2xl">
        <SheetHeader className="border-b pb-4 px-4">
          <SheetTitle className="text-lg font-semibold">Edit Person</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            ICG-ID: <span className="font-mono font-medium">{person.icgId}</span> — cannot be changed.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-6">

                {/* Section 1 — Identity */}
                <section className="rounded-xl border bg-muted/30 dark:bg-muted/20 p-4 space-y-4">
                  <SectionHeader>Identity</SectionHeader>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="commonName"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Display Name <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Common alias / display name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                              <SelectItem value="wishlist">Wishlist</SelectItem>
                              <SelectItem value="archived">Archived</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="specialization"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Specialization</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Glamour" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>

                {/* Section 2 — Career & Rating */}
                <section className="rounded-xl border bg-muted/30 dark:bg-muted/20 p-4 space-y-4">
                  <SectionHeader>Career &amp; Rating</SectionHeader>
                  <div className="grid grid-cols-4 gap-3">
                    <FormField
                      control={form.control}
                      name="activeSince"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Active Since</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="e.g. 2018"
                              {...field}
                              value={(field.value as number | undefined) ?? ""}
                              onChange={(e) =>
                                field.onChange(e.target.value === "" ? "" : e.target.value)
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="retiredIn"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Retired In</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="e.g. 2022"
                              {...field}
                              value={(field.value as number | undefined) ?? ""}
                              onChange={(e) =>
                                field.onChange(e.target.value === "" ? "" : e.target.value)
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="rating"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Rating (1–5)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={5}
                              placeholder="1–5"
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
                      name="pgrade"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>PGRADE (1–10)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={10}
                              placeholder="1–10"
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
                  </div>
                </section>

                {/* Section 3 — Origin */}
                <section className="rounded-xl border bg-muted/30 dark:bg-muted/20 p-4 space-y-4">
                  <SectionHeader>Origin</SectionHeader>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="sexAtBirth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sex at Birth</FormLabel>
                          <Select
                            onValueChange={(v) => field.onChange(v === "_none" ? undefined : v)}
                            value={field.value ?? "_none"}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select…" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="_none">— not specified —</SelectItem>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormItem className="col-span-2">
                      <FormLabel>Birthdate</FormLabel>
                      <PartialDateInput
                        dateValue={form.watch("birthdate") ?? ""}
                        precisionValue={form.watch("birthdatePrecision") ?? "UNKNOWN"}
                        onDateChange={(val) => form.setValue("birthdate", val || undefined)}
                        onPrecisionChange={(val) => form.setValue("birthdatePrecision", val as "UNKNOWN" | "YEAR" | "MONTH" | "DAY")}
                      />
                    </FormItem>

                    <FormField
                      control={form.control}
                      name="birthPlace"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Birth Place</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Berlin, Germany" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="nationality"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nationality</FormLabel>
                          <FormControl>
                            <CountryPicker
                              value={field.value || undefined}
                              onChange={(code) => field.onChange(code ?? "")}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="ethnicity"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Ethnicity</FormLabel>
                          <Select
                            onValueChange={(v) => field.onChange(v === "_none" ? undefined : v)}
                            value={field.value ?? "_none"}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select ethnicity…" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="_none">— not specified —</SelectItem>
                              {ETHNICITY_OPTIONS.map((opt) => (
                                <SelectItem key={opt} value={opt}>
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>

                {/* Section 4 — Appearance */}
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
            </div>

            <SheetFooter className="border-t px-4 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
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
