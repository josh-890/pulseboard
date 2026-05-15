import {
  SessionInlineLocation,
  SessionInlineDescription,
  SessionInlineNotes,
} from "@/components/sessions/session-detail-header";

type SessionAboutCardProps = {
  sessionId: string;
  location: string | null;
  description: string | null;
  notes: string | null;
};

export function SessionAboutCard({ sessionId, location, description, notes }: SessionAboutCardProps) {
  if (!location && !description && !notes) return null;

  return (
    <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm space-y-4">
      <SessionInlineLocation sessionId={sessionId} location={location} />
      <div className="border-t border-white/10" />
      <SessionInlineDescription sessionId={sessionId} description={description} />
      <div className="border-t border-white/10" />
      <SessionInlineNotes sessionId={sessionId} notes={notes} />
    </div>
  );
}
