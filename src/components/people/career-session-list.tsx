"use client";

import type { PersonSessionWorkEntry } from "@/lib/types";
import { SessionWorkCard } from "@/components/people/session-work-card";

type CareerSessionListProps = {
  entries: PersonSessionWorkEntry[];
};

export function CareerSessionList({ entries }: CareerSessionListProps) {
  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <SessionWorkCard key={entry.sessionId} entry={entry} />
      ))}
    </div>
  );
}
