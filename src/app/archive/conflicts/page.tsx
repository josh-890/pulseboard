import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getConflictSession } from '@/lib/services/conflict-session-service'
import { ConflictSessionClient } from '@/components/archive/workbench/conflict-session-client'

export const dynamic = 'force-dynamic'

/**
 * Where a folder's claim and its set's cast are reconciled (ADR-0028).
 *
 * The list is computed, never stored, so this page needs no filter and no view
 * state: whatever still contradicts itself is what is here.
 */
export default async function ConflictsPage() {
  return withTenantFromHeaders(async () => {
    const session = await getConflictSession()
    return <ConflictSessionClient data={session} />
  })
}
