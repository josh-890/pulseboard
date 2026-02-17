"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  personaFormSchema,
  type PersonaFormValues,
} from "@/lib/validations/persona";
import { addPersona } from "@/lib/actions/persona-actions";
import type { TraitCategory } from "@/lib/types";

type AddPersonaDialogProps = {
  personId: string;
  categories: TraitCategory[];
};

export function AddPersonaDialog({
  personId,
  categories,
}: AddPersonaDialogProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const form = useForm<PersonaFormValues>({
    resolver: zodResolver(personaFormSchema) as Resolver<PersonaFormValues>,
    defaultValues: {
      effectiveDate: "",
      note: "",
      jobTitle: "",
      department: "",
      phone: "",
      address: "",
      traits: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "traits",
  });

  async function onSubmit(values: PersonaFormValues) {
    // Strip empty optional strings so they don't create no-op scalar changes
    const cleaned: PersonaFormValues = {
      ...values,
      jobTitle: values.jobTitle || undefined,
      department: values.department || undefined,
      phone: values.phone || undefined,
      address: values.address || undefined,
      traits: values.traits?.length ? values.traits : undefined,
    };

    const result = await addPersona(personId, cleaned);

    if (result.success) {
      toast.success("Persona added");
      setOpen(false);
      form.reset();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus size={14} className="mr-1" />
          Add Persona
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Persona</DialogTitle>
          <DialogDescription>
            Record a profile change. Leave scalar fields blank for no change.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Effective Date */}
            <FormField
              control={form.control}
              name="effectiveDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Effective Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Note */}
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional note about this change..."
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Scalar Fields */}
            <div>
              <h3 className="mb-2 text-sm font-semibold">Profile Fields</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="jobTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job Title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Senior Developer" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Engineering" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. +49 30 1234567" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Berlin, Germany" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Trait Changes */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Trait Changes</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    append({ traitCategoryId: "", name: "", action: "add" })
                  }
                >
                  <Plus size={14} className="mr-1" />
                  Add trait
                </Button>
              </div>

              {fields.length > 0 && (
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="flex items-start gap-2 rounded-lg border p-3"
                    >
                      <div className="grid flex-1 gap-2 sm:grid-cols-3">
                        {/* Category Select */}
                        <FormField
                          control={form.control}
                          name={`traits.${index}.traitCategoryId`}
                          render={({ field: selectField }) => (
                            <FormItem>
                              <Select
                                value={selectField.value}
                                onValueChange={selectField.onChange}
                              >
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Category" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {categories.map((cat) => (
                                    <SelectItem key={cat.id} value={cat.id}>
                                      {cat.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Trait Name */}
                        <FormField
                          control={form.control}
                          name={`traits.${index}.name`}
                          render={({ field: nameField }) => (
                            <FormItem>
                              <FormControl>
                                <Input placeholder="Trait name" {...nameField} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Action Toggle */}
                        <FormField
                          control={form.control}
                          name={`traits.${index}.action`}
                          render={({ field: actionField }) => (
                            <FormItem>
                              <Select
                                value={actionField.value}
                                onValueChange={actionField.onChange}
                              >
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="add">+ Add</SelectItem>
                                  <SelectItem value="remove">
                                    &minus; Remove
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-0.5 shrink-0"
                        onClick={() => remove(index)}
                      >
                        <X size={14} />
                        <span className="sr-only">Remove trait</span>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && (
                  <Loader2 size={16} className="mr-2 animate-spin" />
                )}
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  form.reset();
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
