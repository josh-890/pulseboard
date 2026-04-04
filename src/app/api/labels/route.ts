import { NextResponse } from 'next/server'
import { getLabels } from '@/lib/services/label-service'

/** GET /api/labels — return all labels for client-side selects */
export async function GET() {
  const labels = await getLabels()
  return NextResponse.json(
    labels.map((l) => ({ id: l.id, name: l.name })),
  )
}
