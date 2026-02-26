"use client";

import { useState, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X, Check, XCircle, ChevronDown, ChevronUp } from "lucide-react";
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
  createSetStandaloneSchema,
  type CreateSetStandaloneFormValues,
  type CreateSetStandaloneInput,
  type LabelEvidenceEntry,
} from "@/lib/validations/set";
import { createSetStandalone, saveSetLabelEvidence } from "@/lib/actions/set-actions";
import { CreditEntryStep } from "./credit-entry-step";
import { PartialDateInput } from "@/components/shared/partial-date-input";

type LabelMapEntry = { labelId: string; labelName: string; confidence: number };

export type ChannelOptionWithMaps = {
  id: string;
  name: string;
  labelName: string | null;
  labelId: string | null;
  labelMaps: LabelMapEntry[];
};

type AddSetSheetProps = {
  channels: ChannelOptionWithMaps[];
  recentChannelIds?: string[];
  defaultType?: "photo" | "video" | null;
};

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-0.5 rounded-full bg-primary" />
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
    </div>
  );
}

export function AddSetSheet({ channels, recentChannelIds = [], defaultType }: AddSetSheetProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [createdSetId, setCreatedSetId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [showMore, setShowMore] = useState(false);

  // Label evidence from ChannelLabelMap suggestions
  const [suggestedLabels, setSuggestedLabels] = useState<LabelMapEntry[]>([]);
  const [confirmedLabelIds, setConfirmedLabelIds] = useState<Set<string>>(new Set());

  const form = useForm<CreateSetStandaloneFormValues, unknown, CreateSetStandaloneInput>({
    resolver: zodResolver(createSetStandaloneSchema),
    defaultValues: {
      channelId: "",
      type: defaultType ?? undefined,
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

  // Sort channels: recent first, then alphabetical
  const sortedChannels = useMemo(() => {
    if (recentChannelIds.length === 0) return channels;
    const recentSet = new Set(recentChannelIds);
    const recent: ChannelOptionWithMaps[] = [];
    const rest: ChannelOptionWithMaps[] = [];
    for (const c of channels) {
      if (recentSet.has(c.id)) {
        recent.push(c);
      } else {
        rest.push(c);
      }
    }
    // Maintain order from recentChannelIds
    recent.sort((a, b) => recentChannelIds.indexOf(a.id) - recentChannelIds.indexOf(b.id));
    return [...recent, ...rest];
  }, [channels, recentChannelIds]);

  const handleChannelChange = useCallback((channelId: string) => {
    const channel = channels.find((c) => c.id === channelId);
    if (channel && channel.labelMaps.length > 0) {
      setSuggestedLabels(channel.labelMaps);
      setConfirmedLabelIds(new Set(channel.labelMaps.map((m) => m.labelId)));
    } else {
      setSuggestedLabels([]);
      setConfirmedLabelIds(new Set());
    }
  }, [channels]);

  function toggleLabelConfirmation(labelId: string) {
    setConfirmedLabelIds((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) {
        next.delete(labelId);
      } else {
        next.add(labelId);
      }
      return next;
    });
  }

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
    setSuggestedLabels([]);
    setConfirmedLabelIds(new Set());
    setShowMore(false);
    form.reset({
      channelId: "",
      type: defaultType ?? undefined,
      title: "",
      description: "",
      notes: "",
      category: "",
      genre: "",
      tags: [],
    });
    setTagInput("");
  }

  async function onSubmit(values: CreateSetStandaloneInput) {
    const result = await createSetStandalone(values);

    if (!result.success) {
      toast.error(typeof result.error === "string" ? result.error : "Failed to create set");
      return;
    }

    // Save confirmed label evidence
    const confirmedEvidence: LabelEvidenceEntry[] = suggestedLabels
      .filter((l) => confirmedLabelIds.has(l.labelId))
      .map((l) => ({
        labelId: l.labelId,
        evidenceType: "CHANNEL_MAP" as const,
        confidence: l.confidence,
      }));

    if (confirmedEvidence.length > 0) {
      await saveSetLabelEvidence(result.setId, confirmedEvidence);
    }

    setCreatedSetId(result.setId);
    setStep(2);
  }

  const recentDividerIndex = recentChannelIds.length > 0
    ? recentChannelIds.length
    : -1;

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
            {step === 1 ? "Set details" : "Add credits"}
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

                  {/* Essential fields */}
                  <section className="rounded-xl border bg-muted/30 dark:bg-muted/20 p-4 space-y-4">
                    <SectionHeader>Details</SectionHeader>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Type toggle */}
                      <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                          <FormItem className="col-span-2">
                            <FormLabel>Type <span className="text-destructive">*</span></FormLabel>
                            <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
                              {(["photo", "video"] as const).map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => field.onChange(t)}
                                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                                    field.value === t
                                      ? "bg-background shadow-sm text-foreground"
                                      : "text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  {t === "photo" ? "Photo" : "Video"}
                                </button>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Title — autofocused */}
                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem className="col-span-2">
                            <FormLabel>Title <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                              <Input placeholder="Set title" autoFocus {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Channel — with recent channels first */}
                      <FormField
                        control={form.control}
                        name="channelId"
                        render={({ field }) => (
                          <FormItem className="col-span-2">
                            <FormLabel>Channel <span className="text-destructive">*</span></FormLabel>
                            <Select
                              onValueChange={(v) => {
                                field.onChange(v);
                                handleChannelChange(v);
                              }}
                              value={field.value ?? ""}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select channel…" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {sortedChannels.map((c, i) => (
                                  <SelectItem
                                    key={c.id}
                                    value={c.id}
                                    className={i === recentDividerIndex ? "border-t mt-1 pt-1" : undefined}
                                  >
                                    {c.name}{c.labelName ? ` (${c.labelName})` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Label evidence suggestions */}
                      {suggestedLabels.length > 0 && (
                        <div className="col-span-2 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Label suggestions
                          </p>
                          {suggestedLabels.map((label) => {
                            const isConfirmed = confirmedLabelIds.has(label.labelId);
                            return (
                              <div
                                key={label.labelId}
                                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors ${
                                  isConfirmed
                                    ? "border-emerald-500/30 bg-emerald-500/10"
                                    : "border-white/15 bg-card/40 opacity-60"
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-sm font-medium">{label.labelName}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {Math.round(label.confidence * 100)}%
                                  </span>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => toggleLabelConfirmation(label.labelId)}
                                  aria-label={isConfirmed ? `Dismiss ${label.labelName}` : `Confirm ${label.labelName}`}
                                >
                                  {isConfirmed ? (
                                    <Check size={14} className="text-emerald-500" />
                                  ) : (
                                    <XCircle size={14} className="text-muted-foreground" />
                                  )}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Release Date */}
                      <FormItem className="col-span-2">
                        <FormLabel>Release Date</FormLabel>
                        <PartialDateInput
                          dateValue={form.watch("releaseDate") ?? ""}
                          precisionValue={form.watch("releaseDatePrecision") ?? "UNKNOWN"}
                          onDateChange={(val) => form.setValue("releaseDate", val || undefined)}
                          onPrecisionChange={(val) => form.setValue("releaseDatePrecision", val as "UNKNOWN" | "YEAR" | "MONTH" | "DAY")}
                        />
                      </FormItem>
                    </div>
                  </section>

                  {/* Show more toggle */}
                  <button
                    type="button"
                    onClick={() => setShowMore((v) => !v)}
                    className="flex w-full items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    {showMore ? (
                      <>
                        <ChevronUp size={14} />
                        Hide options
                      </>
                    ) : (
                      <>
                        <ChevronDown size={14} />
                        Show more options
                      </>
                    )}
                  </button>

                  {/* Collapsible optional fields */}
                  {showMore && (
                    <section className="rounded-xl border bg-muted/30 dark:bg-muted/20 p-4 space-y-4">
                      <SectionHeader>Additional</SectionHeader>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
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
                  )}

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
          <CreditEntryStep setId={createdSetId} onClose={handleClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}
