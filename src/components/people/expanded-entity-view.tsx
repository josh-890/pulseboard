"use client";

import type { ReactNode } from "react";

// Phase G Slice 12 / project_identity_bearing_ui: layout shell that imposes
// the four-section structure (Status / Properties / Photos / Lifecycle) on
// the expanded view of identity-bearing entity rows (body marks + body
// modifications). The action toolbar (pin / photos / edit / delete) sits
// above the sections, unchanged from today's layout.
//
// Each slot is optional — empty sections collapse out entirely (populated-
// only, matching the BodyFeaturesCard rule one level up). Section labels
// stay small + uppercase so they don't compete visually with the content.

type Props = {
  toolbar?: ReactNode;
  status?: ReactNode;
  currentProperties?: ReactNode;
  photos?: ReactNode;
  lifecycle?: ReactNode;
};

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
      {children}
    </h4>
  );
}

export function ExpandedEntityView({
  toolbar,
  status,
  currentProperties,
  photos,
  lifecycle,
}: Props) {
  // Layout:
  //  Row 1: action toolbar (left) + status pill (right) — same row
  //  Below: 3 labelled sections separated by faint dividers
  // The status pill lives at top-right per the plan, not as its own
  // labelled section.
  return (
    <div className="space-y-3">
      {(toolbar || status) && (
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1">{toolbar}</div>
          {status && <div className="shrink-0">{status}</div>}
        </div>
      )}

      {currentProperties && (
        <section className="border-t border-white/5 pt-3">
          <SectionHeader>Properties</SectionHeader>
          <div>{currentProperties}</div>
        </section>
      )}

      {photos && (
        <section className="border-t border-white/5 pt-3">
          <SectionHeader>Photos</SectionHeader>
          <div>{photos}</div>
        </section>
      )}

      {lifecycle && (
        <section className="border-t border-white/5 pt-3">
          <SectionHeader>Lifecycle</SectionHeader>
          <div>{lifecycle}</div>
        </section>
      )}
    </div>
  );
}
