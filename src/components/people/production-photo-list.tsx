"use client";

import { useCallback, useState } from "react";
import type { PersonProductionSession } from "@/lib/types";
import { ProductionSessionSection } from "@/components/people/production-session-section";

type ProductionPhotoListProps = {
  sessions: PersonProductionSession[];
};

export function ProductionPhotoList({ sessions }: ProductionPhotoListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleSession = useCallback((sessionId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }, []);

  return (
    <div className="space-y-2">
      {sessions.map((session) => (
        <ProductionSessionSection
          key={session.sessionId}
          session={session}
          isExpanded={expandedIds.has(session.sessionId)}
          onToggle={() => toggleSession(session.sessionId)}
        />
      ))}
    </div>
  );
}
