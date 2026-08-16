import { notFound } from 'next/navigation'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import {
  getWorkbenchGroup,
  getWorkbenchFolderSession,
} from '@/lib/services/attribution-confirm-service'
import { WorkbenchClient } from '@/components/archive/workbench/workbench-client'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

// The attribution workbench (ADR-0027). A room of its own: the queue answers
// "what do I work on next" and wants a scannable list; this answers "who is in
// this set" and wants the screen. Growing the second inside the first left the
// important task with whatever space the list did not use.
//
// Two ways in. `?group=` is the queue's: a whole alias group, worked in a pass.
// `?folder=` is the archive list's: one folder, whatever state it is in —
// including a folder settled long ago, which no group would ever surface again.
export default async function WorkbenchPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const groupKey = one(sp.group)
  const folderId = one(sp.folder)
  if (!groupKey && !folderId) notFound()
  const fromRaw = one(sp.from)
  const from = fromRaw === 'conflicted' || fromRaw === 'decided' ? fromRaw : 'open'

  return withTenantFromHeaders(async () => {
    const data = folderId
      ? await getWorkbenchFolderSession(folderId)
      : await getWorkbenchGroup(groupKey!)
    if (!data) notFound()

    // Only what the client renders. Date objects and unused fields in a client
    // prop can silently break SSR of other client components under Turbopack.
    return (
      <WorkbenchClient
        from={from}
        data={{
          key: data.key,
          channelShortName: data.channelShortName,
          aliasToken: data.aliasToken,
          votes: data.votes,
          votedFolders: data.votedFolders,
          nextGroupKey: data.nextGroupKey,
          references: data.references,
          folders: data.folders.map((f) => ({
            id: f.id,
            folderName: f.folderName,
            fullPath: f.fullPath,
            coverUrl: f.coverUrl,
            isVideo: f.isVideo,
            identity: f.identity,
            rejectedIcgIds: f.rejectedIcgIds,
            suggestions: f.suggestions,
            attributions: f.attributions,
            matcherSuggestion: f.matcherSuggestion
              ? {
                  title: f.matcherSuggestion.title,
                  releaseDate: f.matcherSuggestion.releaseDate,
                  channelName: f.matcherSuggestion.channelName,
                  agrees: f.matcherSuggestion.agrees,
                }
              : null,
          })),
        }}
      />
    )
  })
}
