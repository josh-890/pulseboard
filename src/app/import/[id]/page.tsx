export const dynamic = 'force-dynamic'

import { withTenantFromHeaders } from '@/lib/tenant-context'
import { notFound } from 'next/navigation'
import { refreshBatchMatches } from '@/lib/services/import/staging-service'
import { ImportWorkspace } from '@/components/import/import-workspace'

type ImportWorkspacePageProps = {
  params: Promise<{ id: string }>
}

export default async function ImportWorkspacePage({ params }: ImportWorkspacePageProps) {
  return withTenantFromHeaders(async () => {
    const { id } = await params

    try {
      // Refresh matches on every page load (dynamic sync)
      const batch = await refreshBatchMatches(id)

      return <ImportWorkspace batch={batch} />
    } catch (err) {
      console.error('[ImportWorkspacePage] Error loading batch:', err)
      notFound()
    }
  })
}
