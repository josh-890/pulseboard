import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonaTimelineEntry } from "./persona-timeline-entry";
import { PersonaDialog } from "./persona-dialog";
import { PersonaDeleteButton } from "./persona-delete-button";
import type {
  PersonaTimelineEntry as TimelineEntryType,
  TraitCategory,
} from "@/lib/types";

type PersonaTimelineProps = {
  entries: TimelineEntryType[];
  personId: string;
  categories: TraitCategory[];
};

function buildEditDefaults(entry: TimelineEntryType, categories: TraitCategory[]) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = entry.effectiveDate;
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // Build scalar defaults — find current values from scalarChanges
  const scalarMap = new Map(entry.scalarChanges.map((s) => [s.field, s.value ?? ""]));

  return {
    effectiveDate: dateStr,
    note: entry.note ?? "",
    jobTitle: scalarMap.get("jobTitle") ?? "",
    department: scalarMap.get("department") ?? "",
    phone: scalarMap.get("phone") ?? "",
    address: scalarMap.get("address") ?? "",
    traits: entry.traitChanges.map((tc) => ({
      traitCategoryId: tc.traitCategoryId,
      categoryName: tc.categoryName,
      name: tc.name,
      action: tc.action,
    })),
  };
}

export function PersonaTimeline({
  entries,
  personId,
  categories,
}: PersonaTimelineProps) {
  const reversed = entries.slice().reverse();

  return (
    <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md md:p-8 dark:border-white/10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">History</h2>
        <PersonaDialog
          mode="create"
          personId={personId}
          categories={categories}
          trigger={
            <Button variant="outline" size="sm">
              <Plus size={14} className="mr-1" />
              Add Persona
            </Button>
          }
        />
      </div>

      {reversed.length === 0 ? (
        <p className="text-center text-muted-foreground">
          No history entries yet
        </p>
      ) : (
        <div>
          {reversed.map((entry, index) => (
            <PersonaTimelineEntry
              key={entry.id}
              entry={entry}
              isFirst={index === reversed.length - 1}
              actions={
                <div className="flex items-center gap-1">
                  <PersonaDialog
                    mode="edit"
                    personId={personId}
                    personaId={entry.id}
                    sequenceNum={entry.sequenceNum}
                    categories={categories}
                    defaultValues={buildEditDefaults(entry, categories)}
                    trigger={
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                        <Pencil size={14} />
                        <span className="sr-only">Edit persona</span>
                      </Button>
                    }
                  />
                  {index !== reversed.length - 1 && (
                    <PersonaDeleteButton
                      personaId={entry.id}
                      personId={personId}
                      label={`#${entry.sequenceNum} — ${entry.effectiveDate.toLocaleDateString()}`}
                    />
                  )}
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
