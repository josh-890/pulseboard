import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getArchiveStubs } from '@/lib/services/archive-stub-service'
import { ArchiveStubsList } from '@/components/archive/archive-stubs-list'

export default async function ArchiveStubsPage() {
  return withTenantFromHeaders(async () => {
    const items = await getArchiveStubs()
    return <ArchiveStubsList items={items} />
  })
}
