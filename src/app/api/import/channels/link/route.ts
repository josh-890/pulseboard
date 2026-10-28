import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { addChannelImportAlias, ImportAliasTakenError } from '@/lib/services/channel-service'
import { computeDependencies } from '@/lib/services/import/staging-service'
import { withTenantFromHeaders } from '@/lib/tenant-context'

/**
 * Link an import item to an existing channel and save the alias.
 * Body: { itemId: string, channelId: string, importName: string }
 */
export async function POST(request: Request) {
  return withTenantFromHeaders(async () => {
    const { itemId, channelId, importName } = await request.json()

    if (!itemId || !channelId || !importName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Save the import alias on the channel — the link itself (ADR-0038)
    try {
      await addChannelImportAlias(channelId, importName)
    } catch (err) {
      if (err instanceof ImportAliasTakenError) return NextResponse.json({ error: err.message }, { status: 409 })
      throw err
    }

    // Mark the channel import item as matched
    const item = await prisma.importItem.update({
      where: { id: itemId },
      data: {
        matchedEntityId: channelId,
        matchConfidence: 1.0,
        matchDetails: `Manually linked to channel (alias saved)`,
        status: 'MATCHED',
        blockedReason: null,
      },
    })

    // Recompute dependencies so blocked items (e.g. sets) get unblocked
    await computeDependencies(item.batchId)

    return NextResponse.json({ success: true })
  })
}
