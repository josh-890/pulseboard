"use client";

import { useTransition } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { setSessionStatusAction } from "@/lib/actions/session-actions";
import type { SessionStatus } from "@/generated/prisma/client";

type SessionStatusToggleProps = {
  sessionId: string;
  status: SessionStatus;
};

export function SessionStatusToggle({ sessionId, status }: SessionStatusToggleProps) {
  const [isPending, startTransition] = useTransition();

  if (status === "DRAFT") {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(() => setSessionStatusAction(sessionId, "CONFIRMED"))
        }
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
      >
        <CheckCircle2 size={13} />
        {isPending ? "Confirming…" : "Confirm"}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(() => setSessionStatusAction(sessionId, "DRAFT"))
      }
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
    >
      <RotateCcw size={12} />
      {isPending ? "Reverting…" : "Revert to Draft"}
    </button>
  );
}
