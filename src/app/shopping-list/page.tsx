export const dynamic = 'force-dynamic'

import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getMediaQueue } from '@/lib/services/archive-service'
import { MediaQueueClient } from '@/components/media-queue/media-queue-client'

export default async function ShoppingListPage() {
  return withTenantFromHeaders(async () => {
    const { items, total } = await getMediaQueue({})
    return <MediaQueueClient initialItems={items} total={total} />
  })
}
