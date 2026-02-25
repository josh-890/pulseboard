"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  createSetWithContextSchema,
  type CreateSetWithContextFormValues,
  type CreateSetWithContextInput,
} from "@/lib/validations/set";
import { createSetWithContext } from "@/lib/actions/set-actions";
import { ContributorsStep } from "./contributors-step";
import { PartialDateInput } from "@/components/shared/partial-date-input";

type ChannelOption = { id: string; name: string; labelName: string; labelId: string };

type AddSetSheetProps = {
  channels: ChannelOption[];
};

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-0.5 rounded-full bg-primary" />
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
    </div>
  );
}

export function AddSetSheet({ channels }: AddSetSheetProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [createdSetId, setCreatedSetId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  const form = useForm<CreateSetWithContextFormValues, unknown, CreateSetWithContextInput>({
    resolver: zodResolver(createSetWithContextSchema),
    defaultValues: {
      channelId: "",
      title: "",
      description: "",
      notes: "",
      category: "",
      genre: "",
      tags: [],
    },
  });

  const { isSubmitting } = form.formState;
  const tags = form.watch("tags") ?? [];

  function addTag() {
    const trimmed = tagInput.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    form.setValue("tags", [...tags, trimmed]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    form.setValue("tags", tags.filter((t) => t !== tag));
  }

  function handleClose() {
    setOpen(false);
    setStep(1);
    setCreatedSetId(null);
    form.reset();
    setTagInput("");
  }

  async function onSubmit(values: CreateSetWithContextInput) {
    const result = await createSetWithContext(values);

    if (result.success) {
      setCreatedSetId(result.setId);
      setStep(2);
      return;
    }

    toast.error(typeof result.error === "string" ? result.error : "Failed to create set");
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={16} />
        Add Set
      </Button>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-2xl">
        <SheetHeader className="border-b pb-4 px-4">
          <SheetTitle className="text-lg font-semibold">Add Set</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Step {step} of 2 —{" "}
            {step === 1 ? "Set details & context" : "Add contributors"}
          </SheetDescription>
        </SheetHeader>

        {step === 1 && (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-1 flex-col overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-6">

                  {/* Section 1 — Details */}
                  <section className="rounded-xl border bg-muted/30 dark:bg-muted/20 p-4 space-y-4">
                    <SectionHeader>Details</SectionHeader>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Type <span className="text-destructive">*</span></FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ""}>
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select type…" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="photo">Photo</SelectItem>
                                <SelectItem value="video">Video</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormItem className="col-span-2">
                        <FormLabel>Release Date</FormLabel>
                        <PartialDateInput
                          dateValue={form.watch("releaseDate") ?? ""}
                          precisionValue={form.watch("releaseDatePrecision") ?? "UNKNOWN"}
                          onDateChange={(val) => form.setValue("releaseDate", val || undefined)}
                          onPrecisionChange={(val) => form.setValue("releaseDatePrecision", val as "UNKNOWN" | "YEAR" | "MONTH" | "DAY")}
                        />
                      </FormItem>

                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem className="col-span-2">
                            <FormLabel>Title <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                              <Input placeholder="Set title" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Category</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Portrait" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="genre"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Genre</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Glamour" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </section>

                  {/* Section 2 — Context */}
                  <section className="rounded-xl border bg-muted/30 dark:bg-muted/20 p-4 space-y-4">
                    <SectionHeader>Context</SectionHeader>
                    <div className="space-y-3">
                      <FormField
                        control={form.control}
                        name="channelId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Channel <span className="text-destructive">*</span></FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? ""}>
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select channel…" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {channels.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name} ({c.labelName})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Brief description…" rows={2} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Notes</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Internal notes…" rows={2} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Tags */}
                      <FormItem>
                        <FormLabel>Tags</FormLabel>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Add a tag…"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); addTag(); }
                            }}
                          />
                          <Button type="button" variant="outline" size="sm" onClick={addTag}>
                            Add
                          </Button>
                        </div>
                        {tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="gap-1">
                                {tag}
                                <button
                                  type="button"
                                  onClick={() => removeTag(tag)}
                                  className="ml-0.5 rounded-full outline-none hover:text-destructive focus-visible:ring-1 focus-visible:ring-ring"
                                  aria-label={`Remove tag ${tag}`}
                                >
                                  <X size={10} />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </FormItem>
                    </div>
                  </section>

                </div>
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
                  {isSubmitting ? "Creating…" : "Create Set →"}
                </Button>
              </SheetFooter>
            </form>
          </Form>
        )}

        {step === 2 && createdSetId && (
          <ContributorsStep setId={createdSetId} onClose={handleClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}
