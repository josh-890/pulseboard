"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Layers } from "lucide-react";
import type { PersonDetailUse } from "@/lib/services/detail-use-service";

type LightboxDetailUsesProps = {
  mediaItemId: string;
};

// "Used in details" (2026-11-12): whose detail categories already hold this
// photo — a copy in their reference session, or an aligned image baked from it —
// so you see it while browsing a set, before pressing D. Renders nothing when unused.
export function LightboxDetailUses({ mediaItemId }: LightboxDetailUsesProps) {
  const [state, setState] = useState<{ id: string; uses: PersonDetailUse[] } | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/media/${mediaItemId}/detail-uses`)
      .then((r) => (r.ok ? r.json() : []))
      .then((uses: PersonDetailUse[]) => {
        if (live) setState({ id: mediaItemId, uses });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [mediaItemId]);

  const uses = state && state.id === mediaItemId ? state.uses : [];
  if (uses.length === 0) return null;

  const byPerson = new Map<string, { name: string; cats: string[] }>();
  for (const u of uses) {
    const entry = byPerson.get(u.personId) ?? { name: u.personName, cats: [] };
    entry.cats.push(u.kind === "aligned" ? `${u.categoryName} (aligned)` : u.categoryName);
    byPerson.set(u.personId, entry);
  }

  return (
    <div className="mb-2 rounded-md border border-amber-400/20 bg-amber-400/5 px-2 py-1.5 text-xs" data-testid="lightbox-detail-uses">
      <div className="mb-1 flex items-center gap-1.5 font-semibold uppercase tracking-wider text-amber-300/80">
        <Layers size={12} aria-hidden="true" />
        Used in details
      </div>
      <ul className="space-y-0.5">
        {[...byPerson.entries()].map(([personId, p]) => (
          <li key={personId} className="text-white/70">
            <Link href={`/people/${personId}?tab=details`} className="text-white/90 hover:underline">
              {p.name}
            </Link>
            : {p.cats.join(" · ")}
          </li>
        ))}
      </ul>
    </div>
  );
}
