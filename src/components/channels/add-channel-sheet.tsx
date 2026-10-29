"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
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
  createChannelSchema,
  NEW_LABEL,
  type CreateChannelFormValues,
  type CreateChannelInput,
} from "@/lib/validations/channel";
import { createChannel, linkChannelNameAction } from "@/lib/actions/channel-actions";
import { channelArchiveFolder, cn } from "@/lib/utils";
import { CHANNEL_TIER_CONFIG } from "@/lib/constants/channel-tier";

type AddChannelSheetProps = {
  labels: { id: string; name: string }[];
  defaultLabelId?: string;
  /** Prefill the form (Channel check: from an archive folder or an import name) */
  initialValues?: { name?: string; shortName?: string; channelFolder?: string };
  /** Recorded as the new channel's import alias — the link (ADR-0038, channels) */
  importAlias?: string;
  /** Replaces the default "Add Channel" button */
  triggerLabel?: string;
  /** Stay on the page instead of opening the new channel */
  onCreated?: () => void;
};

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-0.5 rounded-full bg-primary" />
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
    </div>
  );
}

export function AddChannelSheet({
  labels,
  defaultLabelId,
  initialValues,
  importAlias,
  triggerLabel,
  onCreated,
}: AddChannelSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSuggestion, setIsSuggestion] = useState(!initialValues?.shortName);
  // The archive folder follows the norm `SHORT-Channelname` until you type your own
  const [folderIsSuggestion, setFolderIsSuggestion] = useState(!initialValues?.channelFolder);
  const [shortNameAvailable, setShortNameAvailable] = useState<boolean | null>(null);
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<CreateChannelFormValues, unknown, CreateChannelInput>({
    resolver: zodResolver(createChannelSchema),
    defaultValues: {
      labelId: defaultLabelId ?? "",
      name: initialValues?.name ?? "",
      shortName: initialValues?.shortName ?? "",
      channelFolder: initialValues?.channelFolder ?? "",
      platform: "",
      url: "",
      tier: "NORMAL",
    },
  });

  const { isSubmitting } = form.formState;
  const shortNameValue = useWatch({ control: form.control, name: "shortName" });
  const labelValue = useWatch({ control: form.control, name: "labelId" });
  const nameValue = useWatch({ control: form.control, name: "name" });
  const newLabelName = nameValue?.trim() ?? "";

  useEffect(() => {
    if (!folderIsSuggestion) return;
    form.setValue("channelFolder", channelArchiveFolder(shortNameValue, nameValue));
  }, [folderIsSuggestion, shortNameValue, nameValue, form]);
  const sameNameLabel =
    labelValue === NEW_LABEL && newLabelName
      ? labels.find((l) => l.name.trim().toLowerCase() === newLabelName.toLowerCase())
      : undefined;

  // Check availability when shortName changes
  useEffect(() => {
    if (!shortNameValue?.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShortNameAvailable(null);
      return;
    }
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    checkTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/channels/short-name?check=${encodeURIComponent(shortNameValue.trim())}`);
        const data = await res.json();
        setShortNameAvailable(data.available);
      } catch {
        setShortNameAvailable(null);
      }
    }, 300);
    return () => { if (checkTimerRef.current) clearTimeout(checkTimerRef.current); };
  }, [shortNameValue]);

  // Fetch unique suggestion when name changes and shortName is still a suggestion
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleNameChange(newName: string) {
    if (!isSuggestion) return;
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    nameDebounceRef.current = setTimeout(async () => {
      if (!newName.trim()) { form.setValue("shortName", ""); return; }
      try {
        const res = await fetch(`/api/channels/short-name?name=${encodeURIComponent(newName.trim())}`);
        const data = await res.json();
        if (data.suggestion) form.setValue("shortName", data.suggestion, { shouldDirty: true });
      } catch { /* ignore */ }
    }, 300);
  }

  async function onSubmit(values: CreateChannelInput) {
    // The archive's norm when left blank: "SHORT-Channelname"
    const channelFolder = values.channelFolder?.trim() || channelArchiveFolder(values.shortName, values.name) || undefined
    const result = await createChannel({ ...values, channelFolder });
    if (result.success) {
      let message = labelValue === NEW_LABEL ? `Label and channel ${values.name} created` : "Channel created";
      if (importAlias) {
        const linked = await linkChannelNameAction(result.id, importAlias);
        if (!linked.success) toast.error(linked.error);
        else message = `${message} — ${linked.count} staged set${linked.count === 1 ? "" : "s"} connected`;
      }
      toast.success(message);
      form.reset();
      setIsSuggestion(!initialValues?.shortName);
      setFolderIsSuggestion(!initialValues?.channelFolder);
      setShortNameAvailable(null);
      setOpen(false);
      if (onCreated) onCreated();
      else router.push(`/channels/${result.id}`);
      return;
    }
    const err = typeof result.error === "string" ? result.error : "Failed to create channel";
    toast.error(err);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button size="sm" variant={triggerLabel ? "outline" : "default"} onClick={() => setOpen(true)}>
        <Plus size={16} />
        {triggerLabel ?? "Add Channel"}
      </Button>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader className="border-b pb-4 px-4">
          <SheetTitle className="text-lg font-semibold">Add Channel</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Create a new distribution channel.
            {importAlias && (
              <>
                {" "}Import alias: <span className="font-medium text-foreground">{importAlias}</span>
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-6">
                <section className="rounded-xl border bg-muted/30 dark:bg-muted/20 p-4 space-y-4">
                  <SectionHeader>Details</SectionHeader>
                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="labelId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Label <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <select
                              {...field}
                              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                              <option value="">Select a label</option>
                              <option value={NEW_LABEL}>+ New label with the channel&apos;s name</option>
                              {labels.map((label) => (
                                <option key={label.id} value={label.id}>
                                  {label.name}
                                </option>
                              ))}
                            </select>
                          </FormControl>
                          {labelValue === NEW_LABEL && (
                            sameNameLabel ? (
                              <p className="text-xs text-destructive">
                                A label &ldquo;{sameNameLabel.name}&rdquo; already exists —{" "}
                                <button
                                  type="button"
                                  className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onClick={() => form.setValue("labelId", sameNameLabel.id, { shouldDirty: true })}
                                >
                                  select it
                                </button>
                              </p>
                            ) : (
                              <p className="text-[10px] text-muted-foreground">
                                {newLabelName
                                  ? <>Creates the label <span className="font-medium text-foreground">{newLabelName}</span> together with the channel</>
                                  : "Creates a label named like the channel, together with it"}
                              </p>
                            )
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Channel name"
                              {...field}
                              onChange={(e) => {
                                field.onChange(e);
                                handleNameChange(e.target.value);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="shortName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Short Name</FormLabel>
                          <div className="space-y-1">
                            <FormControl>
                              <Input
                                placeholder="e.g. FJ"
                                {...field}
                                className={cn(
                                  isSuggestion && field.value && "italic !text-amber-500 dark:!text-amber-400 !border-amber-400/50 !bg-amber-500/5",
                                )}
                                onFocus={() => {
                                  if (isSuggestion) setIsSuggestion(false);
                                }}
                                onChange={(e) => {
                                  field.onChange(e);
                                  setIsSuggestion(false);
                                }}
                              />
                            </FormControl>
                            {shortNameAvailable === false && (
                              <p className="text-xs text-destructive">Already taken</p>
                            )}
                            {isSuggestion && field.value && (
                              <p className="text-[10px] text-amber-500 dark:text-amber-400">Auto-suggested — edit to change</p>
                            )}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="channelFolder"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Archive Folder</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. SN-ChannelName"
                              {...field}
                              className={cn(
                                folderIsSuggestion && field.value && "italic !text-amber-500 dark:!text-amber-400 !border-amber-400/50 !bg-amber-500/5",
                              )}
                              onChange={(e) => {
                                field.onChange(e);
                                setFolderIsSuggestion(!e.target.value.trim());
                              }}
                            />
                          </FormControl>
                          <p className="text-[10px] text-muted-foreground">
                            {folderIsSuggestion
                              ? "Follows Short Name + Name (SHORT-Channelname, spaces and dashes dropped) — edit to change"
                              : "Folder name under the archive root — clear it to follow Short Name + Name again"}
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="platform"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Platform</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Web, App, Social" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>URL</FormLabel>
                          <FormControl>
                            <Input placeholder="https://example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="tier"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tier</FormLabel>
                          <FormControl>
                            <select
                              {...field}
                              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                              {CHANNEL_TIER_CONFIG.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.letter} · {t.label}
                                </option>
                              ))}
                            </select>
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
                onClick={() => { form.reset(); setIsSuggestion(!initialValues?.shortName); setFolderIsSuggestion(!initialValues?.channelFolder); setShortNameAvailable(null); setOpen(false); }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || shortNameAvailable === false || Boolean(sameNameLabel)}>
                {isSubmitting ? "Creating..." : "Create Channel"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
