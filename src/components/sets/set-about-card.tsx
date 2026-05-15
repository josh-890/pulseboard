import { SetInlineDescription, SetInlineNotes } from "@/components/sets/set-detail-header";

type SetAboutCardProps = {
  setId: string;
  description: string | null;
  notes: string | null;
};

export function SetAboutCard({ setId, description, notes }: SetAboutCardProps) {
  return (
    <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm space-y-4">
      <SetInlineDescription setId={setId} description={description} />
      <div className="border-t border-white/10" />
      <SetInlineNotes setId={setId} notes={notes} />
    </div>
  );
}
