"use client";
/* eslint-disable react-hooks/incompatible-library */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  updateSetSchema,
  type UpdateSetFormValues,
  type UpdateSetInput,
} from "@/lib/validations/set";
import { updateSet } from "@/lib/actions/set-actions";
import { setEntityTagsAction } from "@/lib/actions/tag-actions";
import type { SetType } from "@/lib/types";
import { PartialDateInput } from "@/components/shared/partial-date-input";
import { TagPicker } from "@/components/shared/tag-picker";
import type { TagChipData } from "@/components/shared/tag-chips";

type ChannelOption = { id: string; name: string; labelName: string | null };

type EditSetSheetProps = {
  set: {
    id: string;
    type: SetType;
    title: string;
    channelId: string | null;
    description: string | null;
    notes: string | null;
    releaseDate: Date | null;
    releaseDatePrecision: string;
    category: string | null;
    genre: string | null;
    tags: string[];
    isCompilation: boolean;
    isComplete: boolean;
    imageCount: number | null;
    videoLength: string | null;
  };
  channels: ChannelOption[];
  entityTags?: TagChipData[];
};

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-0.5 rounded-full bg-primary" />
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
    </div>
  );
}

export function EditSetSheet({ set, channels, entityTags = [] }: EditSetSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [entityTagIds, setEntityTagIds] = useState(entityTags.map((t) => t.id));

  const getDefaults = () => ({
    id: set.id,
    title: set.title,
    channelId: set.channelId ?? undefined,
    description: set.description ?? "",
    notes: set.notes ?? "",
    releaseDate: set.releaseDate ? set.releaseDate.toISOString().slice(0, 10) : "",
    releaseDatePrecision: (set.releaseDatePrecision as "UNKNOWN" | "YEAR" | "MONTH" | "DAY") ?? "UNKNOWN",
    category: set.category ?? "",
    genre: set.genre ?? "",
    tags: set.tags,
    isCompilation: set.isCompilation,
    isComplete: set.isComplete,
    imageCount: set.imageCount ?? undefined,
    videoLength: set.videoLength ?? "",
  });

  const form = useForm<UpdateSetFormValues, unknown, UpdateSetInput>({
    resolver: zodResolver(updateSetSchema),
    defaultValues: getDefaults(),
  });

  const { isSubmitting } = form.formState;
  const isPhoto = set.type === "photo";
  const isVideo = set.type === "video";

  async function onSubmit(values: UpdateSetInput) {
    const result = await updateSet(values);
    if (result.success) {
      toast.success("Set updated");
      setOpen(false);
      router.refresh();
      return;
    }
    toast.error(typeof result.error === "string" ? result.error : "Failed to update set");
  }

  const TYPE_LABELS: Record<SetType, string> = { photo: "Photo", video: "Video" };

  return (
    <Sheet open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v) { form.reset(getDefaults()); setEntityTagIds(entityTags.map((t) => t.id)); }
    }}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil size={16} />
        Edit
      </Button>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-2xl">
        <SheetHeader className="border-b pb-4 px-4">
          <SheetTitle className="text-lg font-semibold">Edit Set</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Type: <span className="font-medium">{TYPE_LABELS[set.type]}</span> — cannot be changed.
          </SheetDescription>
        </SheetHeader>

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

                    {/* Flags row */}
                    <div className="col-span-2 flex flex-wrap gap-x-6 gap-y-2">
                      <FormField
                        control={form.control}
                        name="isComplete"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <FormLabel className="!mt-0 cursor-pointer font-normal">Set complete</FormLabel>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="isCompilation"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2">
                            <FormControl>
                              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                            <FormLabel className="!mt-0 cursor-pointer font-normal">Compilation</FormLabel>
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormItem className="col-span-2">
                      <FormLabel>Release Date</FormLabel>
                      <PartialDateInput
                        dateValue={form.watch("releaseDate") ?? ""}
                        precisionValue={form.watch("releaseDatePrecision") ?? "UNKNOWN"}
                        onDateChange={(val) => form.setValue("releaseDate", val || undefined)}
                        onPrecisionChange={(val) => form.setValue("releaseDatePrecision", val as "UNKNOWN" | "YEAR" | "MONTH" | "DAY")}
                      />
                    </FormItem>

                    {/* Photo-only: image count */}
                    {isPhoto && (
                      <FormField
                        control={form.control}
                        name="imageCount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Number of images</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                placeholder="e.g. 120"
                                value={field.value ?? ""}
                                onChange={(e) =>
                                  field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Video-only: video length */}
                    {isVideo && (
                      <FormField
                        control={form.control}
                        name="videoLength"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Video length</FormLabel>
                            <FormControl>
                              <Input placeholder="h:mm:ss" {...field} value={field.value ?? ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

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
                          <FormLabel>Channel</FormLabel>
                          <Select
                            onValueChange={(v) => field.onChange(v === "_none" ? undefined : v)}
                            value={field.value ?? "_none"}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select channel…" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="_none">— none —</SelectItem>
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
                      <TagPicker
                        scope="SET"
                        selectedTagIds={entityTagIds}
                        onChange={(newIds) => {
                          setEntityTagIds(newIds);
                          setEntityTagsAction("SET", set.id, newIds);
                        }}
                        selectedTags={entityTags}
                        placeholder="Add tags…"
                        compact
                      />
                    </FormItem>
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
