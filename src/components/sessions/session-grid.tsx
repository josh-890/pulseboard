import { Clapperboard } from "lucide-react";
import { SessionCard } from "./session-card";
import type { getSessions } from "@/lib/services/session-service";

type SessionGridProps = {
  sessions: Awaited<ReturnType<typeof getSessions>>;
};

export function SessionGrid({ sessions }: SessionGridProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-white/20 bg-card/70 py-16 text-center shadow-md backdrop-blur-sm">
        <Clapperboard size={40} className="mb-3 text-muted-foreground/30" />
        <p className="text-muted-foreground">No sessions found.</p>
        <p className="mt-1 text-sm text-muted-foreground/60">
          Sessions are created automatically when you add a set.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sessions.map((session) => (
        <SessionCard key={session.id} session={session} />
      ))}
    </div>
  );
}
