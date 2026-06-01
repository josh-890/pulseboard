"use client";
/* eslint-disable react-hooks/incompatible-library */

import { useMemo, useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  createPersonSchema,
  type CreatePersonFormValues,
  type CreatePersonInput,
} from "@/lib/validations/person";
import {
  HAIR_LENGTH_OPTIONS,
  BUILD_OPTIONS,
  BREAST_SIZE_OPTIONS,
} from "@/lib/constants/appearance";
import { EthnicityFields } from "@/components/people/ethnicity-fields";
import { CountryPicker } from "@/components/shared/country-picker";
import { SelectWithOther } from "@/components/shared/select-with-other";
import { TypedAttributeInput } from "@/components/people/typed-attribute-input";
import type { PhysicalAttributeGroupWithDefinitions } from "@/lib/services/physical-attribute-catalog-service";
import { PartialDateInput } from "@/components/shared/partial-date-input";
import { generateIcgId, cn } from "@/lib/utils";

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-0.5 rounded-full bg-primary" />
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
    </div>
  );
}

type PersonFormProps = {
  onSubmit: (data: CreatePersonInput) => Promise<{ fieldErrors?: Record<string, string[]> } | void>;
  submitLabel?: string;
  onCancel?: () => void;
  // Slice 16E: catalog defs so the hair-color input routes through
  // TypedAttributeInput's colorCategory branch.
  attributeGroups?: PhysicalAttributeGroupWithDefinitions[];
};

export function PersonForm({ onSubmit, submitLabel = "Create Person", onCancel, attributeGroups }: PersonFormProps) {
  const [showAppearance, setShowAppearance] = useState(false);
  const userEditedIcgId = useRef(false);

  // Slice 16E: hair_color catalog def for TypedAttributeInput. Looked up
  // from attributeGroups when available; otherwise falls back to a synthetic
  // definition with the static fields the picker needs (id, slug, name,
  // valueType=TEXT, colorCategory='hair'). The fallback exists because
  // PersonForm is reused by flows (e.g. CreditResolutionPanel) that don't
  // currently plumb the catalog through — keeping the hair-color field
  // available without forcing a deeper refactor right now.
  const hairColorDef = useMemo(() => {
    for (const group of attributeGroups ?? []) {
      for (const def of group.definitions) {
        if (def.slug === "hair_color") return def;
      }
    }
    return {
      id: "cattr-hair-color",
      name: "Hair Color",
      slug: "hair_color",
      unit: null,
      valueType: "TEXT" as const,
      allowedValues: [] as string[],
      ordinalMin: null,
      ordinalMax: null,
      colorCategory: "hair" as const,
    };
  }, [attributeGroups]);

  const form = useForm<CreatePersonFormValues, unknown, CreatePersonInput>({
    resolver: zodResolver(createPersonSchema),
    defaultValues: {
      icgId: "",
      commonName: "",
      status: "active",
    },
  });

  const { isSubmitting } = form.formState;

  const watchedName = form.watch("commonName");
  const watchedBirthdate = form.watch("birthdate");

  // Auto-generate ICG-ID when name or birthdate changes
  useEffect(() => {
    if (userEditedIcgId.current) return;
    if (!watchedName?.trim()) {
      form.setValue("icgId", "");
      return;
    }
    const id = generateIcgId(watchedName, watchedBirthdate);
    form.setValue("icgId", id);
  }, [watchedName, watchedBirthdate, form]);

  function handleRegenerateIcgId() {
    userEditedIcgId.current = false;
    const name = form.getValues("commonName");
    const birthdate = form.getValues("birthdate");
    if (name?.trim()) {
      form.setValue("icgId", generateIcgId(name, birthdate));
    }
  }

  async function handleSubmit(values: CreatePersonInput) {
    const result = await onSubmit(values);

    if (result && result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        if (messages && messages.length > 0) {
          form.setError(field as keyof CreatePersonInput, { message: messages[0] });
        }
      }
      return;
    }

    // Success — reset form
    form.reset();
    setShowAppearance(false);
    userEditedIcgId.current = false;
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-6">

            {/* Essentials */}
            <section className="rounded-xl border bg-muted/30 dark:bg-muted/20 p-4 space-y-4">
              <SectionHeader>Essentials</SectionHeader>

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
                  name="icgId"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel className="flex items-center gap-2">
                        ICG-ID <span className="text-destructive">*</span>
                        {!userEditedIcgId.current && (
                          <span className="text-[10px] font-normal text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded">auto</span>
                        )}
                      </FormLabel>
                      <div className="flex gap-1.5">
                        <FormControl>
                          <Input
                            placeholder="e.g. JD-95@K7R"
                            className="font-mono"
                            {...field}
                            onChange={(e) => {
                              userEditedIcgId.current = true;
                              field.onChange(e.target.value.toUpperCase());
                            }}
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-9 w-9"
                          onClick={handleRegenerateIcgId}
                          title="Regenerate ICG-ID"
                        >
                          <RefreshCw size={14} />
                        </Button>
                      </div>
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                            <SelectValue placeholder="Select..." />
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
                  name="birthName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Birth Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Legal / birth name" {...field} />
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

                {/* Phase G Slice 16C T3+T4: Ethnicity = Broad SINGLE_SELECT +
                    Specific SELECT (filtered by Broad). Hides Specific when
                    Broad has no sub-regions (Mixed / Other). */}
                <EthnicityFields broadName="ethnicityBroad" specificName="ethnicitySpecific" />
              </div>
            </section>

            {/* Appearance — collapsible */}
            <section className="rounded-xl border bg-muted/30 dark:bg-muted/20 overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/40 transition-colors"
                onClick={() => setShowAppearance(!showAppearance)}
              >
                <SectionHeader>Appearance</SectionHeader>
                <ChevronDown
                  size={16}
                  className={cn(
                    "text-muted-foreground transition-transform duration-200",
                    showAppearance && "rotate-180",
                  )}
                />
              </button>

              {showAppearance && (
                <div className="border-t px-4 pb-4 pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Eye Color + Height are now catalog-driven (Phase G Slice 3a,
                        ADR-0005). Set them via the Appearance tab → "+ Track another
                        attribute" or via Record Change. */}
                    <FormField
                      control={form.control}
                      name="currentHairColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hair Color</FormLabel>
                          <FormControl>
                            <TypedAttributeInput
                              definition={hairColorDef}
                              value={field.value ?? ""}
                              onChange={(v) => field.onChange(v)}
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
                              placeholder="Select build..."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="breastSize"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Breast Size</FormLabel>
                          <FormControl>
                            <SelectWithOther
                              options={BREAST_SIZE_OPTIONS}
                              value={field.value || undefined}
                              onChange={(v) => field.onChange(v ?? "")}
                              placeholder="Select cup size..."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="breastDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Breast Description</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. Large (Real)"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="hairLength"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hair Length</FormLabel>
                          <Select
                            onValueChange={(v) => field.onChange(v === "_none" ? undefined : v)}
                            value={field.value ?? "_none"}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select length..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="_none">— not specified —</SelectItem>
                              {HAIR_LENGTH_OPTIONS.map((opt) => (
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
                </div>
              )}
            </section>

          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-4 py-4">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
