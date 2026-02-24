"use client";

import { useState } from "react";
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

type EditChannelSheetProps = {
  channel: {
    id: string;
    name: string;
    labelId: string;
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

  const form = useForm<UpdateChannelFormValues, unknown, UpdateChannelInput>({
    resolver: zodResolver(updateChannelSchema),
    defaultValues: {
      id: channel.id,
      labelId: channel.labelId,
      name: channel.name,
      platform: channel.platform ?? "",
      url: channel.url ?? "",
    },
  });

  const { isSubmitting } = form.formState;

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
    <Sheet open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v) {
        form.reset({
          id: channel.id,
          labelId: channel.labelId,
          name: channel.name,
          platform: channel.platform ?? "",
          url: channel.url ?? "",
        });
      }
    }}>
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
                            <Input placeholder="Channel name" {...field} />
                          </FormControl>
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
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
