import Link from "next/link";
import { Shapes } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComposeEntryLinkProps = { href: string; photoId?: string | null; className?: string; label?: string };

/** The way into the tag workbench (ADR-0042) — from a gallery, or its selection */
export function ComposeEntryLink({ href, photoId, className, label = "Compose" }: ComposeEntryLinkProps) {
  return (
    <Link
      href={photoId ? `${href}?photo=${photoId}` : href}
      data-testid="compose-entry"
      title="Tag pose, clothing, camera and expression — photo by photo"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 bg-card/70 px-2.5 text-xs font-medium shadow-sm transition-colors duration-150",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Shapes size={14} aria-hidden />
      {label}
    </Link>
  );
}
