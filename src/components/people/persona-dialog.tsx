"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn } from "@/lib/utils";
import {
  personaFormSchema,
  type PersonaFormValues,
} from "@/lib/validations/persona";
import {
  addPersona,
  editPersona,
  fetchRemovableTraits,
  type RemovableTrait,
} from "@/lib/actions/persona-actions";
import type { TraitCategory } from "@/lib/types";

type AddTraitEntry = {
  traitCategoryId: string;
  categoryName: string;
  name: string;
};

type PersonaDialogProps = {
  personId: string;
  categories: TraitCategory[];
  trigger: ReactNode;
} & (
  | { mode: "create" }
  | {
      mode: "edit";
      personaId: string;
      sequenceNum: number;
      defaultValues: {
        effectiveDate: string;
        note: string;
        jobTitle: string;
        department: string;
        phone: string;
        address: string;
        traits: Array<{
          traitCategoryId: string;
          categoryName: string;
          name: string;
          action: "add" | "remove";
        }>;
      };
    }
);

export function PersonaDialog(props: PersonaDialogProps) {
  const { personId, categories, trigger, mode } = props;
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const defaults =
    mode === "edit"
      ? props.defaultValues
      : {
          effectiveDate: "",
          note: "",
          jobTitle: "",
          department: "",
          phone: "",
          address: "",
          traits: [] as Array<{
            traitCategoryId: string;
            categoryName: string;
            name: string;
            action: "add" | "remove";
          }>,
        };

  const form = useForm<PersonaFormValues>({
    resolver: zodResolver(personaFormSchema) as Resolver<PersonaFormValues>,
    defaultValues: {
      effectiveDate: defaults.effectiveDate,
      note: defaults.note,
      jobTitle: defaults.jobTitle,
      department: defaults.department,
      phone: defaults.phone,
      address: defaults.address,
      traits: defaults.traits.map((t) => ({
        traitCategoryId: t.traitCategoryId,
        name: t.name,
        action: t.action,
      })),
    },
  });

  // Add traits (green chips) — only "add" action entries
  const defaultAddChips: AddTraitEntry[] = defaults.traits
    .filter((t) => t.action === "add")
    .map((t) => ({
      traitCategoryId: t.traitCategoryId,
      categoryName: t.categoryName,
      name: t.name,
    }));

  // Pre-checked removals from defaultValues
  const defaultRemovedKeys = new Set(
    defaults.traits
      .filter((t) => t.action === "remove")
      .map((t) => `${t.traitCategoryId}:${t.name}`),
  );

  const [addChips, setAddChips] = useState<AddTraitEntry[]>(defaultAddChips);
  const [showTraitAdd, setShowTraitAdd] = useState(false);
  const [newTraitCategory, setNewTraitCategory] = useState("");
  const [newTraitName, setNewTraitName] = useState("");

  // Remove section state
  const [removableTraits, setRemovableTraits] = useState<RemovableTrait[]>([]);
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(defaultRemovedKeys);
  const [removableLoading, setRemovableLoading] = useState(false);

  function syncTraitsToForm(
    chips: AddTraitEntry[],
    checked: Set<string>,
    removable: RemovableTrait[],
  ) {
    const addEntries = chips.map((c) => ({
      traitCategoryId: c.traitCategoryId,
      name: c.name,
      action: "add" as const,
    }));
    const removeEntries = removable
      .filter((t) => checked.has(`${t.traitCategoryId}:${t.name}`))
      .map((t) => ({
        traitCategoryId: t.traitCategoryId,
        name: t.name,
        action: "remove" as const,
      }));
    form.setValue("traits", [...addEntries, ...removeEntries]);
  }

  function handleAddTrait() {
    if (!newTraitCategory || !newTraitName.trim()) return;
    const category = categories.find((c) => c.id === newTraitCategory);
    if (!category) return;

    const chip: AddTraitEntry = {
      traitCategoryId: newTraitCategory,
      categoryName: category.name,
      name: newTraitName.trim(),
    };
    const updated = [...addChips, chip];
    setAddChips(updated);
    syncTraitsToForm(updated, removedKeys, removableTraits);

    setNewTraitCategory("");
    setNewTraitName("");
    setShowTraitAdd(false);
  }

  function handleRemoveAddChip(index: number) {
    const updated = addChips.filter((_, i) => i !== index);
    setAddChips(updated);
    syncTraitsToForm(updated, removedKeys, removableTraits);
  }

  function handleToggleRemoval(key: string) {
    setRemovedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      syncTraitsToForm(addChips, next, removableTraits);
      return next;
    });
  }

  async function loadRemovableTraits() {
    setRemovableLoading(true);
    try {
      const seqNum = mode === "edit" ? props.sequenceNum : undefined;
      const traits = await fetchRemovableTraits(personId, seqNum);
      setRemovableTraits(traits);
    } catch {
      setRemovableTraits([]);
    } finally {
      setRemovableLoading(false);
    }
  }

  // Fetch removable traits when dialog opens
  useEffect(() => {
    if (open) {
      loadRemovableTraits();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(values: PersonaFormValues) {
    const cleaned: PersonaFormValues = {
      ...values,
      jobTitle: values.jobTitle || undefined,
      department: values.department || undefined,
      phone: values.phone || undefined,
      address: values.address || undefined,
      traits: values.traits?.length ? values.traits : undefined,
    };

    const result =
      mode === "create"
        ? await addPersona(personId, cleaned)
        : await editPersona(props.personaId, personId, cleaned);

    if (result.success) {
      toast.success(mode === "create" ? "Persona added" : "Persona updated");
      setOpen(false);
      form.reset();
      setAddChips([]);
      setRemovedKeys(new Set());
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  function handleOpenChange(value: boolean) {
    setOpen(value);
    if (value) {
      form.reset({
        effectiveDate: defaults.effectiveDate,
        note: defaults.note,
        jobTitle: defaults.jobTitle,
        department: defaults.department,
        phone: defaults.phone,
        address: defaults.address,
        traits: defaults.traits.map((t) => ({
          traitCategoryId: t.traitCategoryId,
          name: t.name,
          action: t.action,
        })),
      });
      setAddChips(defaultAddChips);
      setRemovedKeys(new Set(defaultRemovedKeys));
      setShowTraitAdd(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add Persona" : "Edit Persona"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Record a profile change. Leave scalar fields blank for no change."
              : "Update this persona entry."}
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

            {/* Add Traits Section */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Add Traits</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTraitAdd(true)}
                >
                  <Plus size={14} className="mr-1" />
                  Add trait
                </Button>
              </div>

              {/* Add trait chips */}
              {addChips.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {addChips.map((chip, index) => (
                    <Badge
                      key={`${chip.traitCategoryId}:${chip.name}:${index}`}
                      variant="secondary"
                      className="rounded-full border-0 bg-green-100 pr-1 text-xs text-green-800 dark:bg-green-900/30 dark:text-green-400"
                    >
                      +{chip.name}
                      <span className="ml-1 opacity-70">
                        ({chip.categoryName})
                      </span>
                      <button
                        type="button"
                        className="ml-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                        onClick={() => handleRemoveAddChip(index)}
                      >
                        <X size={12} />
                        <span className="sr-only">Remove</span>
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Inline add trait form */}
              {showTraitAdd && (
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Category
                      </label>
                      <Select
                        value={newTraitCategory}
                        onValueChange={setNewTraitCategory}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Trait Name
                      </label>
                      <Input
                        placeholder="e.g. TypeScript"
                        value={newTraitName}
                        onChange={(e) => setNewTraitName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddTrait();
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowTraitAdd(false);
                        setNewTraitCategory("");
                        setNewTraitName("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!newTraitCategory || !newTraitName.trim()}
                      onClick={handleAddTrait}
                    >
                      Confirm
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Remove Existing Traits Section */}
            <div>
              <h3 className="mb-2 text-sm font-semibold">
                Remove Existing Traits
              </h3>
              {removableLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  Loading traits...
                </div>
              ) : removableTraits.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active traits to remove
                </p>
              ) : (
                <div className="space-y-1.5">
                  {removableTraits.map((trait) => {
                    const key = `${trait.traitCategoryId}:${trait.name}`;
                    return (
                      <label
                        key={key}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 transition-colors",
                          removedKeys.has(key)
                            ? "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20"
                            : "border-transparent hover:bg-accent",
                        )}
                      >
                        <Checkbox
                          checked={removedKeys.has(key)}
                          onCheckedChange={() => handleToggleRemoval(key)}
                        />
                        <span className="text-sm">{trait.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({trait.categoryName})
                        </span>
                      </label>
                    );
                  })}
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
                onClick={() => setOpen(false)}
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
