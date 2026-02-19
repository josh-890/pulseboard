"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X, AlertTriangle } from "lucide-react";
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
  createSetForSessionSchema,
  type CreateSetForSessionFormValues,
  type CreateSetForSessionInput,
} from "@/lib/validations/set";
import { createSetForSession } from "@/lib/actions/set-actions";
import { ContributorsStep } from "./contributors-step";

type ChannelOption = { id: string; name: string; labelName: string; labelId: string };

type SessionInfo = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  labelIds: string[];
};

type AddSetToSessionSheetProps = {
  session: SessionInfo;
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

export function AddSetToSessionSheet({ session, channels }: AddSetToSessionSheetProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [createdSetId, setCreatedSetId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [showNewChannelForm, setShowNewChannelForm] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelPlatform, setNewChannelPlatform] = useState("");
  const [coprodLabelName, setCoprodLabelName] = useState<string | null>(null);

  // Primary label for the project (first label) — used for new channels
  const primaryLabelId = session.labelIds[0] ?? null;

  const form = useForm<CreateSetForSessionFormValues, unknown, CreateSetForSessionInput>({
    resolver: zodResolver(createSetForSessionSchema),
    defaultValues: {
      sessionId: session.id,
      projectId: session.projectId,
      channelId: undefined,
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
  const watchedChannelId = form.watch("channelId");

  function handleChannelChange(value: string) {
    if (value === "_none") {
      form.setValue("channelId", undefined);
      form.setValue("newChannel", undefined);
      setCoprodLabelName(null);
      setShowNewChannelForm(false);
      return;
    }
    form.setValue("channelId", value);
    form.setValue("newChannel", undefined);
    setShowNewChannelForm(false);

    // Check co-production: channel's label not in project labels
    const channel = channels.find((c) => c.id === value);
    if (channel && !session.labelIds.includes(channel.labelId)) {
      setCoprodLabelName(channel.labelName);
    } else {
      setCoprodLabelName(null);
    }
  }

  function handleNewChannelToggle() {
    setShowNewChannelForm((v) => !v);
    if (!showNewChannelForm) {
      // switching to new channel mode — clear existing channel selection
      form.setValue("channelId", undefined);
      setCoprodLabelName(null);
    } else {
      // cancelling new channel form
      setNewChannelName("");
      setNewChannelPlatform("");
      form.setValue("newChannel", undefined);
    }
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
    form.reset({
      sessionId: session.id,
      projectId: session.projectId,
      channelId: undefined,
      title: "",
      description: "",
      notes: "",
      category: "",
      genre: "",
      tags: [],
    });
    setTagInput("");
    setShowNewChannelForm(false);
    setNewChannelName("");
    setNewChannelPlatform("");
    setCoprodLabelName(null);
  }

  async function onSubmit(values: CreateSetForSessionInput) {
    // If new channel form is shown, inject newChannel data
    let submitValues = values;
    if (showNewChannelForm && newChannelName.trim() && primaryLabelId) {
      submitValues = {
        ...values,
        channelId: undefined,
        newChannel: {
          name: newChannelName.trim(),
          platform: newChannelPlatform.trim() || undefined,
          labelId: primaryLabelId,
        },
      };
    }

    const result = await createSetForSession(submitValues);

    if (result.success) {
      setCreatedSetId(result.setId);
      setStep(2);
      return;
    }

    toast.error(typeof result.error === "string" ? result.error : "Failed to create set");
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        <Plus size={12} />
        Add Set
      </Button>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-2xl">
        <SheetHeader className="border-b pb-4 px-4">
          <SheetTitle className="text-lg font-semibold">Add Set to Session</SheetTitle>
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

                  {/* Session context (read-only) */}
                  <div className="rounded-xl border border-white/20 bg-primary/5 px-4 py-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                      Session
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {session.name}
                      <span className="font-normal text-muted-foreground"> — {session.projectName}</span>
                    </p>
                  </div>

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

                      <FormField
                        control={form.control}
                        name="releaseDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Release Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

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
                    <SectionHeader>Channel</SectionHeader>
                    <div className="space-y-3">

                      {!showNewChannelForm && (
                        <FormField
                          control={form.control}
                          name="channelId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Channel</FormLabel>
                              <Select
                                onValueChange={handleChannelChange}
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
                      )}

                      {/* Co-production notice */}
                      {coprodLabelName && (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
                          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                          <span>
                            <strong>{coprodLabelName}</strong> will be added as co-producer on this project.
                          </span>
                        </div>
                      )}

                      {/* New channel inline form */}
                      {showNewChannelForm && (
                        <div className="space-y-3 rounded-lg border border-white/20 bg-muted/40 p-3">
                          <p className="text-xs font-medium text-muted-foreground">New channel</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-foreground/80">
                                Name <span className="text-destructive">*</span>
                              </label>
                              <Input
                                placeholder="Channel name"
                                value={newChannelName}
                                onChange={(e) => setNewChannelName(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-foreground/80">
                                Platform
                              </label>
                              <Input
                                placeholder="e.g. OnlyFans"
                                value={newChannelPlatform}
                                onChange={(e) => setNewChannelPlatform(e.target.value)}
                              />
                            </div>
                          </div>
                          {primaryLabelId && (
                            <p className="text-xs text-muted-foreground">
                              Label will be auto-set to the project&apos;s primary label.
                            </p>
                          )}
                          {!primaryLabelId && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              This project has no labels — cannot create a channel without a label.
                            </p>
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleNewChannelToggle}
                        className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
                      >
                        {showNewChannelForm ? "← Back to existing channels" : "+ Create new channel…"}
                      </button>

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
                <Button
                  type="submit"
                  disabled={isSubmitting || (showNewChannelForm && !newChannelName.trim())}
                >
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
