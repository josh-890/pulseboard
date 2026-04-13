import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getArchiveWorkspace } from '@/lib/services/archive-service'
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
  const shortName = getString(sp.shortName)
  const rawYear = getString(sp.year)
  const year = rawYear ? Number(rawYear) : undefined
  const cursor = getString(sp.cursor)

  const filters: WorkspaceFilters = {
    tab,
    isVideo,
    hasSuggestion: hasSuggestion || undefined,
    shortName,
    year,
    cursor,
    pageSize: 50,
  }

  return withTenantFromHeaders(async () => {
    const page = await getArchiveWorkspace(filters)

    return (
      <ArchiveWorkspaceClient
        initialPage={page}
        initialTab={tab}
        initialIsVideo={isVideo}
        initialHasSuggestion={hasSuggestion || undefined}
      />
    )
  })
}
