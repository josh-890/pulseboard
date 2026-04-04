import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createChannelRecord, addChannelImportAlias } from '@/lib/services/channel-service'
import { computeDependencies } from '@/lib/services/import/staging-service'
import { withTenantFromHeaders } from '@/lib/tenant-context'

/**
 * Create a new channel and immediately link it to an import item.
 * Body: { itemId: string, name: string, labelId: string, importName: string }
 */
export async function POST(request: Request) {
  return withTenantFromHeaders(async () => {
    const { itemId, name, shortName, labelId, importName } = await request.json()

    if (!itemId || !name || !labelId || !importName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Create the channel with label
    const channel = await createChannelRecord({ name, shortName, labelId })

    // Always save the import alias — it's the source-system name for future imports
    await addChannelImportAlias(channel.id, importName)

    // Mark the channel import item as matched
    const item = await prisma.importItem.update({
      where: { id: itemId },
      data: {
        matchedEntityId: channel.id,
        matchConfidence: 1.0,
        matchDetails: `Linked to newly created channel "${name}"`,
        status: 'MATCHED',
        blockedReason: null,
      },
    })

    // Recompute dependencies so blocked items (e.g. sets) get unblocked
    await computeDependencies(item.batchId)

    return NextResponse.json({ success: true, channelId: channel.id })
  })
}
