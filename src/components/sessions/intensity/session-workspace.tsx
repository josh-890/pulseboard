"use client";

import { useIntensityPanel } from "./intensity-panel-provider";

export type SessionWorkspaceProps = {
  main: React.ReactNode;
  sidebar: React.ReactNode;
  /** The intensity panel — null when the catalog has no acts */
  panel: React.ReactNode | null;
};

// The production session's two columns. With the intensity panel open it takes
// the right column instead of the sidebar, a little wider, and stays in view
// while the photos scroll beside it.
export function SessionWorkspace({ main, sidebar, panel }: SessionWorkspaceProps) {
  const { open } = useIntensityPanel();
  const showPanel = open && panel !== null;
  return (
    <div className={showPanel ? "grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_440px]" : "grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_340px]"}>
      <div className="min-w-0 space-y-6">{main}</div>
      {showPanel ? (
        <div className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain">{panel}</div>
      ) : (
        <div className="space-y-6">{sidebar}</div>
      )}
    </div>
  );
}
