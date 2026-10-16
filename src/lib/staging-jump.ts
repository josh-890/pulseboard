// A jump from a person's career to one of their staged sets (2026-10-16): the
// staging workspace opens that set over a temporary view of the person's staged
// sets — never saved, so the sticky filters you had come back afterwards.

export type StagingJumpPerson = { id: string; label: string };

/** The person as the workspace's person chip shows it: `Name (ICG-ID)` */
export function stagingJumpPersonLabel(name: string, icgId: string | null): string {
  return icgId && name !== icgId ? `${name} (${icgId})` : name || (icgId ?? "");
}

export function stagedSetJumpHref(input: {
  stagingSetId: string;
  isVideo: boolean;
  person: StagingJumpPerson;
}): string {
  const params = new URLSearchParams({
    select: input.stagingSetId,
    jump: "person",
    personId: input.person.id,
    personLabel: input.person.label,
    type: input.isVideo ? "video" : "photo",
  });
  return `/staging-sets?${params.toString()}`;
}
