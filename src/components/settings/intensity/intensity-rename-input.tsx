"use client";

export type IntensityRenameInputProps = {
  value: string;
  label: string;
  /** Called with the trimmed text when it differs — or not at all */
  onSave: (text: string) => void;
  onDone: () => void;
  className?: string;
};

// The quick rename in place (2026-10-23): a double-click on a level's title or
// a boundary's pill opens it, as on a card. Enter or leaving saves, Esc keeps
// the name as it was. Everything else is edited in the panel.
export function IntensityRenameInput({
  value,
  label,
  onSave,
  onDone,
  className,
}: IntensityRenameInputProps) {
  function finish(text: string) {
    const next = text.trim();
    onDone();
    if (next && next !== value) onSave(next);
  }
  return (
    <input
      autoFocus
      defaultValue={value}
      aria-label={label}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => finish(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onDone();
        }
      }}
      className={
        className ??
        "border-primary/30 bg-background focus:ring-primary/50 w-full min-w-0 rounded-md border px-1.5 py-0.5 text-sm outline-none focus:ring-1"
      }
    />
  );
}
