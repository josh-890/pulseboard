"use client";

import { useState, useEffect, useRef } from "react";
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
  updateChannelSchema,
  type UpdateChannelFormValues,
  type UpdateChannelInput,
} from "@/lib/validations/channel";
import { updateChannel } from "@/lib/actions/channel-actions";
import { cn } from "@/lib/utils";

type EditChannelSheetProps = {
  channel: {
    id: string;
    name: string;
    shortName: string | null;
    labelId: string | null;
    platform: string | null;
    url: string | null;
  };
  labels: { id: string; name: string }[];
};

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-0.5 rounded-full bg-primary" />
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
    </div>
  );
}

export function EditChannelSheet({ channel, labels }: EditChannelSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSuggestion, setIsSuggestion] = useState(false);
  const [shortNameAvailable, setShortNameAvailable] = useState<boolean | null>(null);
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<UpdateChannelFormValues, unknown, UpdateChannelInput>({
    resolver: zodResolver(updateChannelSchema),
    defaultValues: {
      id: channel.id,
      labelId: channel.labelId ?? "",
      name: channel.name,
      shortName: channel.shortName ?? "",
      platform: channel.platform ?? "",
      url: channel.url ?? "",
    },
  });

  const { isSubmitting } = form.formState;
  const shortNameValue = form.watch("shortName");

  // Check availability when shortName changes
  useEffect(() => {
    if (!shortNameValue?.trim()) {
      setShortNameAvailable(null);
      return;
    }
    // If the shortName hasn't changed from the original, it's always available
    if (shortNameValue.trim() === channel.shortName) {
      setShortNameAvailable(true);
      return;
    }
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    checkTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/channels/short-name?check=${encodeURIComponent(shortNameValue.trim())}&excludeId=${channel.id}`
        );
        const data = await res.json();
        setShortNameAvailable(data.available);
      } catch {
        setShortNameAvailable(null);
      }
    }, 300);
    return () => { if (checkTimerRef.current) clearTimeout(checkTimerRef.current); };
  }, [shortNameValue, channel.shortName, channel.id]);

  // Fetch unique suggestion when name changes and shortName is a suggestion
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleNameChange(newName: string) {
    if (!isSuggestion) return;
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    nameDebounceRef.current = setTimeout(async () => {
      if (!newName.trim()) { form.setValue("shortName", ""); return; }
      try {
        const res = await fetch(
          `/api/channels/short-name?name=${encodeURIComponent(newName.trim())}&excludeId=${channel.id}`
        );
        const data = await res.json();
        if (data.suggestion) form.setValue("shortName", data.suggestion, { shouldDirty: true });
      } catch { /* ignore */ }
    }, 300);
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      form.reset({
        id: channel.id,
        labelId: channel.labelId ?? "",
        name: channel.name,
        shortName: channel.shortName ?? "",
        platform: channel.platform ?? "",
        url: channel.url ?? "",
      });
      setShortNameAvailable(null);
      setIsSuggestion(!channel.shortName);
    }
  }

  // On open: if shortName is empty, fetch a unique suggestion
  useEffect(() => {
    if (!open || channel.shortName || !channel.name) return;
    fetch(
      `/api/channels/short-name?name=${encodeURIComponent(channel.name.trim())}&excludeId=${channel.id}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.suggestion) form.setValue("shortName", data.suggestion, { shouldDirty: true });
      })
      .catch(() => { /* ignore */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(values: UpdateChannelInput) {
    const result = await updateChannel(values);
    if (result.success) {
      toast.success("Channel updated");
      setOpen(false);
      router.refresh();
      return;
    }
    toast.error(typeof result.error === "string" ? result.error : "Failed to update channel");
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil size={16} />
        Edit
      </Button>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader className="border-b pb-4 px-4">
          <SheetTitle className="text-lg font-semibold">Edit Channel</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Update channel details.
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
                              {labels.map((label) => (
                                <option key={label.id} value={label.id}>
                                  {label.name}
                                </option>
                              ))}
                            </select>
                          </FormControl>
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
              <Button type="submit" disabled={isSubmitting || shortNameAvailable === false}>
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
