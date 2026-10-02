import { EntityTagsPanel } from "@/components/tags";
import type { EffectiveTag } from "@/lib/effective-tags";

type SessionTagSectionProps = {
  sessionId: string;
  initialTags: EffectiveTag[];
};

// A session is the top of the content chain: it inherits nothing, and its
// tags flow down to its sets and images (ADR-0033).
export function SessionTagSection({ sessionId, initialTags }: SessionTagSectionProps) {
  return (
    <div className="relative z-10 rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
      <h3 className="mb-1 text-sm font-medium text-muted-foreground">Tags</h3>
      <p className="mb-3 text-xs text-muted-foreground/70">Also apply to this session&apos;s sets and images.</p>
      <EntityTagsPanel entityType="SESSION" entityId={sessionId} initialTags={initialTags} />
    </div>
  );
}
