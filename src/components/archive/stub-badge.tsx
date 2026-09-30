import { Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { STUB_REASON_LABEL } from "@/lib/archive-stub";
import type { ArchiveStub } from "@/lib/archive-stub";

type StubBadgeProps = {
  stub: ArchiveStub;
  className?: string;
};

/**
 * "Stub" pill (ADR-0032): the archive copy is a deliberate placeholder. Violet,
 * not amber/red — it is an intention, not a fault the scan found.
 */
export function StubBadge({ stub, className }: StubBadgeProps) {
  const title = [
    `Stub — ${STUB_REASON_LABEL[stub.reason]}`,
    stub.note,
    `since ${new Date(stub.since).toLocaleDateString()}`,
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <span
      title={title}
      aria-label={`Stub archive copy: ${STUB_REASON_LABEL[stub.reason]}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium",
        "text-violet-700 dark:text-violet-300",
        className,
      )}
    >
      <Hourglass size={10} aria-hidden />
      Stub
    </span>
  );
}
