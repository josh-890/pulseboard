"use client";

import { useEffect } from "react";
import { useFormContext, useWatch, type Path, type FieldValues } from "react-hook-form";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
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
  ETHNICITY_BROAD_OPTIONS,
  ETHNICITY_SPECIFIC_BY_BROAD,
  broadHasSpecifics,
  type EthnicityBroad,
} from "@/lib/constants/ethnicity";

// Phase G Slice 16C T4: shared Ethnicity (Broad) + Ethnicity (Specific)
// form fields. Specific is a SELECT dependent on the current Broad value;
// hides entirely when the Broad has no Specifics (Mixed / Other).
//
// Storage is TEXT for Specific (no DB-level constraint); UI enforces the
// per-Broad lookup via ETHNICITY_SPECIFIC_BY_BROAD.
//
// On Broad change, clears Specific if the current Specific isn't valid
// for the new Broad (or if the new Broad has no Specifics).

type Props<TFieldValues extends FieldValues> = {
  broadName: Path<TFieldValues>;
  specificName: Path<TFieldValues>;
  /** Grid spanning when the parent uses a grid container. */
  className?: string;
};

export function EthnicityFields<TFieldValues extends FieldValues>({
  broadName,
  specificName,
  className,
}: Props<TFieldValues>) {
  const { control, setValue, getValues } = useFormContext<TFieldValues>();
  const broadValue = useWatch({ control, name: broadName }) as string | undefined;

  // When Broad changes, clear Specific if it's no longer valid for the new
  // Broad. Skip on initial render (broad === undefined post-mount).
  useEffect(() => {
    if (broadValue === undefined) return;
    const validSpecifics = broadValue
      ? (ETHNICITY_SPECIFIC_BY_BROAD[broadValue as EthnicityBroad] ?? [])
      : [];
    const currentSpecific = getValues(specificName) as string | undefined;
    if (currentSpecific && !validSpecifics.includes(currentSpecific)) {
      // Reset to undefined; the form's resolver will treat it as empty.
      setValue(specificName, undefined as never, { shouldDirty: true });
    }
  }, [broadValue, control, setValue, getValues, specificName]);

  const specificsForBroad = broadValue
    ? (ETHNICITY_SPECIFIC_BY_BROAD[broadValue as EthnicityBroad] ?? [])
    : [];
  const showSpecific = broadHasSpecifics(broadValue);

  return (
    <>
      <FormField
        control={control}
        name={broadName}
        render={({ field }) => (
          <FormItem className={className}>
            <FormLabel>Ethnicity (Broad)</FormLabel>
            <Select
              onValueChange={(v) => field.onChange(v === "_none" ? undefined : v)}
              value={(field.value as string | undefined) ?? "_none"}
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select broad category..." />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="_none">— not specified —</SelectItem>
                {ETHNICITY_BROAD_OPTIONS.map((opt) => (
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

      {showSpecific && (
        <FormField
          control={control}
          name={specificName}
          render={({ field }) => (
            <FormItem className={className}>
              <FormLabel>Ethnicity (Specific)</FormLabel>
              <Select
                onValueChange={(v) => field.onChange(v === "_none" ? undefined : v)}
                value={(field.value as string | undefined) ?? "_none"}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select sub-region (optional)..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="_none">— not specified —</SelectItem>
                  {specificsForBroad.map((opt) => (
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
      )}
    </>
  );
}
