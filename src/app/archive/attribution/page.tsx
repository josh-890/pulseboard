import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getAttributionQueue } from '@/lib/services/attribution-confirm-service'
import { AttributionQueueClient } from '@/components/archive/attribution-queue-client'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function getString(val: string | string[] | undefined): string | undefined {
  return Array.isArray(val) ? val[0] : val
}

export default async function AttributionPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const view = getString(sp.view) === 'conflicted' ? 'conflicted' : getString(sp.view) === 'decided' ? 'decided' : 'open'

  return withTenantFromHeaders(async () => {
    // The queue is ~8.9k groups; render the leverage-ordered head and let the
    // operator page down. Loading all of them would ship a payload for work that
    // will not be reached in one sitting.
    const queue = await getAttributionQueue({ limit: 200, view })

    return <AttributionQueueClient initialQueue={queue} view={view} />
  })
}
