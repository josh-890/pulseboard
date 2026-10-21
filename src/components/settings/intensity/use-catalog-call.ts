"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SimpleActionResult } from "@/lib/types";

/** Runs a catalog action, refreshes the page, toasts a failure; throws on failure so inline editors stay open */
export function useCatalogCall() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function call(action: () => Promise<SimpleActionResult>) {
    const result = await action();
    if (!result.success) {
      toast.error(result.error ?? "Could not save");
      throw new Error(result.error);
    }
    startTransition(() => router.refresh());
  }

  /** Fire-and-forget variant for buttons */
  function run(action: () => Promise<SimpleActionResult>) {
    call(action).catch(() => {});
  }

  return { call, run, pending };
}
