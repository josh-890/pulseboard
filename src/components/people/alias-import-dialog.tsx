"use client";

import { useCallback, useState, useTransition } from "react";
import { useEscToClose } from "@/lib/hooks/use-esc-to-close";
import { FileUp, X, AlertTriangle, Check } from "lucide-react";
import { bulkImportAliasesAction } from "@/lib/actions/alias-actions";

type ParsedEntry = {
  name: string;
  channelName?: string;
};

type ImportResult = {
  created: number;
  linked: number;
  unmatched: string[];
};

type AliasImportDialogProps = {
  personId: string;
  onClose: () => void;
};

export function AliasImportDialog({ personId, onClose }: AliasImportDialogProps) {
  const [isPending, startTransition] = useTransition();
  useEscToClose(onClose);
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<ParsedEntry[] | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleParse = useCallback(() => {
    const lines = rawText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      setError("No entries to import.");
      return;
    }

    const entries: ParsedEntry[] = lines.map((line) => {
      const parts = line.split("\t");
      return {
        name: parts[0].trim(),
        channelName: parts[1]?.trim() || undefined,
      };
    });

    setParsed(entries);
    setError(null);
  }, [rawText]);

  const handleImport = useCallback(() => {
    if (!parsed || parsed.length === 0) return;

    startTransition(async () => {
      setError(null);
      const res = await bulkImportAliasesAction(personId, parsed);
      if (!res.success) {
        setError(res.error ?? "Import failed.");
        return;
      }
      setResult({
        created: res.created ?? 0,
        linked: res.linked ?? 0,
        unmatched: res.unmatched ?? [],
      });
    });
  }, [parsed, personId]);

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-background p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FileUp size={18} />
            Bulk Import Aliases
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {!result ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste aliases, one per line. Use tab to separate alias name and channel name:
            </p>
            <pre className="rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {"AliasName<tab>ChannelName\nAliasName"}
            </pre>

            <textarea
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                setParsed(null);
              }}
              placeholder={"Alias 1\tChannel A\nAlias 2\nAlias 3\tChannel B"}
              rows={8}
              className="w-full rounded-lg border border-white/15 bg-muted/30 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              autoFocus
            />

            {/* Parsed preview */}
            {parsed && parsed.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-muted/20">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs text-muted-foreground">
                      <th className="px-3 py-1.5 text-left font-medium">Name</th>
                      <th className="px-3 py-1.5 text-left font-medium">Channel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((entry, i) => (
                      <tr key={i} className="border-b border-white/5">
                        <td className="px-3 py-1.5">{entry.name}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {entry.channelName || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              {!parsed ? (
                <button
                  type="button"
                  onClick={handleParse}
                  disabled={!rawText.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  Preview
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={isPending}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isPending ? "Importing..." : `Import ${parsed.length} entries`}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-500">
              <Check size={18} />
              <span className="font-medium">Import Complete</span>
            </div>
            <div className="space-y-1 text-sm">
              <p>{result.created} new aliases created</p>
              <p>{result.linked} channel links established</p>
              {result.unmatched.length > 0 && (
                <div className="mt-2">
                  <p className="flex items-center gap-1.5 text-amber-500">
                    <AlertTriangle size={14} />
                    {result.unmatched.length} unmatched channels:
                  </p>
                  <ul className="ml-5 mt-1 list-disc text-xs text-muted-foreground">
                    {result.unmatched.map((name, i) => (
                      <li key={i}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
