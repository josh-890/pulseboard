import { Briefcase, Building2, Phone, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TraitBadge } from "./trait-badge";
import { formatRelativeTime } from "@/lib/utils";
import type { CurrentPersonState } from "@/lib/types";

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

type PersonaCurrentStateProps = {
  state: CurrentPersonState;
};

const scalarFields = [
  { key: "jobTitle" as const, label: "Job Title", Icon: Briefcase },
  { key: "department" as const, label: "Department", Icon: Building2 },
  { key: "phone" as const, label: "Phone", Icon: Phone },
  { key: "address" as const, label: "Address", Icon: MapPin },
];

export function PersonaCurrentState({ state }: PersonaCurrentStateProps) {
  if (state.personaCount === 0) {
    return (
      <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md md:p-8 dark:border-white/10">
        <h2 className="text-xl font-semibold">Current Profile</h2>
        <p className="mt-4 text-center text-muted-foreground">
          No profile history yet
        </p>
      </div>
    );
  }

  const activeScalars = scalarFields.filter((f) => state[f.key] !== null);

  // Group traits by category
  const traitsByCategory = new Map<string, typeof state.traits>();
  for (const trait of state.traits) {
    const group = traitsByCategory.get(trait.categoryName) ?? [];
    group.push(trait);
    traitsByCategory.set(trait.categoryName, group);
  }

  return (
    <div className="rounded-2xl border border-white/30 bg-card/70 p-6 shadow-lg backdrop-blur-md md:p-8 dark:border-white/10">
      <h2 className="text-xl font-semibold">Current Profile</h2>

      {activeScalars.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {activeScalars.map(({ key, label, Icon }) => (
            <div key={key} className="flex items-center gap-2">
              <Icon size={16} className="shrink-0 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{label}:</span>
              <span className="text-sm font-medium">{state[key]}</span>
            </div>
          ))}
        </div>
      )}

      {traitsByCategory.size > 0 && (
        <div className="mt-5 space-y-3">
          {Array.from(traitsByCategory.entries()).map(
            ([categoryName, traits]) => (
              <div key={categoryName}>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {categoryName}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {traits.map((trait) => (
                    <TraitBadge
                      key={`${trait.traitCategoryId}:${trait.name}`}
                      trait={trait}
                    />
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {state.removedTraits.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Former Traits
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {state.removedTraits.map((trait) => (
              <Badge
                key={`removed:${trait.traitCategoryId}:${trait.name}:${trait.removedDate.toISOString()}`}
                variant="secondary"
                className="rounded-full border-0 bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-500"
              >
                {trait.name}
                <span className="ml-1 opacity-70">
                  ({formatMonthYear(trait.addedDate)} &ndash;{" "}
                  {formatMonthYear(trait.removedDate)})
                </span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      <p className="mt-5 text-xs text-muted-foreground">
        {state.personaCount} persona{state.personaCount !== 1 && "s"}
        {state.latestPersonaDate && (
          <> &middot; Last updated {formatRelativeTime(state.latestPersonaDate)}</>
        )}
      </p>
    </div>
  );
}
