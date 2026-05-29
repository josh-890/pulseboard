"use client";

// Slice 16 follow-up: small wrapper that renders a Tier 1 attribute editor
// with an inline "don't know" toggle. When `unknown` is true the input
// collapses to a muted "Marked unknown" notice with a clear link.
//
// Used by every sheet that edits Tier 1 attributes (record-physical-change,
// edit-physical-change, edit-appearance). Keeps the "don't know" affordance
// consistent across them — the gap before this extraction caused user
// confusion ("why don't I see don't know for Weight?").

export function CoreFieldRow({
  label,
  unknown,
  onUnknownChange,
  children,
}: {
  label: string;
  unknown: boolean;
  onUnknownChange: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="block text-sm font-medium">{label}</label>
        {unknown ? (
          <button
            type="button"
            onClick={() => onUnknownChange(false)}
            className="text-[10px] text-muted-foreground hover:text-foreground underline"
          >
            clear
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onUnknownChange(true)}
            className="text-[10px] text-muted-foreground hover:text-foreground underline"
          >
            don&apos;t know
          </button>
        )}
      </div>
      {unknown ? (
        <p className="text-sm italic text-muted-foreground/70">Marked unknown.</p>
      ) : (
        children
      )}
    </div>
  );
}
