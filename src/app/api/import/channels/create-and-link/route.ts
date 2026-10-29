import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createChannelRecord, addChannelImportAlias, ImportAliasTakenError, LabelExistsError } from '@/lib/services/channel-service'
import { NEW_LABEL } from '@/lib/validations/channel'
import { computeDependencies } from '@/lib/services/import/staging-service'
import { withTenantFromHeaders } from '@/lib/tenant-context'

/**
 * Create a new channel and immediately link it to an import item.
 * Body: { itemId: string, name: string, labelId: string, importName: string }
 * labelId NEW_LABEL creates a label named like the channel, in the same transaction.
 */
export async function POST(request: Request) {
  return withTenantFromHeaders(async () => {
    const { itemId, name, shortName, labelId, importName } = await request.json()

    if (!itemId || !name || !labelId || !importName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Refuse before creating anything when the name already links elsewhere
    const taken = await prisma.channel.findFirst({
      where: { importAliases: { has: String(importName).trim() } },
      select: { name: true },
    })
    if (taken) {
      return NextResponse.json({ error: new ImportAliasTakenError(importName, taken.name).message }, { status: 409 })
    }

    // Create the channel with label (or a new label of the same name)
    const newLabel = labelId === NEW_LABEL
    let channel
    try {
      channel = await createChannelRecord({ name, shortName, labelId: newLabel ? undefined : labelId, newLabel })
    } catch (err) {
      if (err instanceof LabelExistsError) return NextResponse.json({ error: err.message }, { status: 409 })
      throw err
    }

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
