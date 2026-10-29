export const dynamic = 'force-dynamic'

import { withTenantFromHeaders } from '@/lib/tenant-context'
import { notFound } from 'next/navigation'
import { refreshBatchMatches } from '@/lib/services/import/staging-service'
import { ImportWorkspace } from '@/components/import/import-workspace'
import { getDevelopNote } from '@/lib/services/catalogue-develop-service'

type ImportWorkspacePageProps = {
  params: Promise<{ id: string }>
}

export default async function ImportWorkspacePage({ params }: ImportWorkspacePageProps) {
  return withTenantFromHeaders(async () => {
    const { id } = await params

    try {
      // Refresh matches on every page load (dynamic sync)
      const batch = await refreshBatchMatches(id)
      const developNote = await getDevelopNote(batch.subjectIcgId)

      return <ImportWorkspace batch={batch} developNote={developNote} />
    } catch (err) {
      console.error('[ImportWorkspacePage] Error loading batch:', err)
      notFound()
    }
  })
}
