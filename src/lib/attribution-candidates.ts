/**
 * Which people a folder could plausibly be — pure, and deliberately outside the
 * service layer.
 *
 * The review grid is a client component and the attribution service imports
 * Prisma; importing one from the other drags `node:async_hooks` into the browser
 * bundle and 500s the page. Only the build catches that, so the shared rule lives
 * here where both sides can reach it.
 */

export type FolderCandidate = {
  icgId: string
  name: string
  /** True when the catalogue proposed this person for THIS folder. */
  fromFolder: boolean
}

/**
 * Two sources, in this order:
 *   1. what the catalogue join proposed for this folder
 *   2. who the rest of the group points at
 *
 * (2) matters because the join often explains only part of a group: forty folders
 * name Alisa and the forty-first has no suggestion at all, yet Alisa is obviously
 * the first thing to offer. It is a shortcut to a keystroke, never an answer —
 * the operator still presses the key.
 *
 * Deliberately NOT a name search. An ICG-ID must come from a real record, and
 * fuzzy person matching is forbidden in this project (it silently merged
 * different real people before it was removed in 2026-05-26).
 */
export function candidatesForFolder(
  folderSuggestions: { icgId: string; name: string }[],
  groupVotes: { icgId: string; name: string; folders: number }[],
): FolderCandidate[] {
  const out: FolderCandidate[] = []
  const seen = new Set<string>()

  for (const s of folderSuggestions) {
    if (seen.has(s.icgId)) continue
    seen.add(s.icgId)
    out.push({ icgId: s.icgId, name: s.name, fromFolder: true })
  }
  for (const v of [...groupVotes].sort((a, b) => b.folders - a.folders || a.icgId.localeCompare(b.icgId))) {
    if (seen.has(v.icgId)) continue
    seen.add(v.icgId)
    out.push({ icgId: v.icgId, name: v.name, fromFolder: false })
  }
  return out
}
