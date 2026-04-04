import { NextResponse } from 'next/server'
import { getLabels } from '@/lib/services/label-service'
import { withTenantFromHeaders } from '@/lib/tenant-context'

/** GET /api/labels — return all labels for client-side selects */
export async function GET() {
  return withTenantFromHeaders(async () => {
    const labels = await getLabels()
    return NextResponse.json(
      labels.map((l) => ({ id: l.id, name: l.name })),
    )
  })
}
