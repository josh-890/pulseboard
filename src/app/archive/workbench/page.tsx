import { notFound } from 'next/navigation'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getWorkbenchGroup } from '@/lib/services/attribution-confirm-service'
import { WorkbenchClient } from '@/components/archive/workbench/workbench-client'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

// The attribution workbench (ADR-0027). A room of its own: the queue answers
// "what do I work on next" and wants a scannable list; this answers "who is in
// this set" and wants the screen. Growing the second inside the first left the
// important task with whatever space the list did not use.
export default async function WorkbenchPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const raw = sp.group
  const groupKey = Array.isArray(raw) ? raw[0] : raw
  if (!groupKey) notFound()
  const fromRaw = Array.isArray(sp.from) ? sp.from[0] : sp.from
  const from = fromRaw === 'conflicted' || fromRaw === 'decided' ? fromRaw : 'open'

  return withTenantFromHeaders(async () => {
    const data = await getWorkbenchGroup(groupKey)
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
