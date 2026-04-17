import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getArchiveWorkspace, getArchiveChannelSummaries } from '@/lib/services/archive-service'
import { ArchiveWorkspaceClient } from '@/components/archive/archive-workspace-client'
import type { WorkspaceFilters } from '@/lib/services/archive-service'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function getString(val: string | string[] | undefined): string | undefined {
  return Array.isArray(val) ? val[0] : val
}

export default async function ArchivePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams

  const rawTab = getString(sp.tab)
  const tab = (rawTab === 'linked' || rawTab === 'phantom' || rawTab === 'untracked')
    ? rawTab
    : 'orphan'

  const rawIsVideo = getString(sp.isVideo)
  const isVideo = rawIsVideo === 'true' ? true : rawIsVideo === 'false' ? false : undefined

  const hasSuggestion = getString(sp.hasSuggestion) === 'true'

  const filters: WorkspaceFilters = {
    tab,
    isVideo,
    hasSuggestion: hasSuggestion || undefined,
    groupBy: 'channelYear',
    pageSize: 200,
    offset: 0,
  }

  const highlightId = getString(sp.highlight)

  return withTenantFromHeaders(async () => {
    // For folder tabs (orphan/linked), fetch channel summaries for the tree view.
    // For phantom/untracked we still use the flat page for the initial render.
    const isFolderTab = tab === 'orphan' || tab === 'linked'

    const [page, channelData] = await Promise.all([
      getArchiveWorkspace(filters),
      isFolderTab
        ? getArchiveChannelSummaries(tab as 'orphan' | 'linked', { isVideo, hasSuggestion: hasSuggestion || undefined })
        : null,
    ])

    return (
      <ArchiveWorkspaceClient
        initialPage={page}
        initialTab={tab}
        initialIsVideo={isVideo}
        initialHasSuggestion={hasSuggestion || undefined}
        highlightId={highlightId}
        initialChannelSummaries={channelData?.summaries ?? null}
      />
    )
  })
}
