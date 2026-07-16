import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { removeChannelImportAlias } from '@/lib/services/channel-service'
import { computeDependencies } from '@/lib/services/import/staging-service'
import { withTenantFromHeaders } from '@/lib/tenant-context'

/**
 * Inverse of /api/import/channels/link — undo a channel resolution so the item
 * can be re-assigned. Clears the item's cached match AND removes the import
 * alias the link added on that channel, so a subsequent refresh won't silently
 * re-derive the wrong channel via the alias.
 *
 * Note: this only sticks when the import name does NOT exactly match a channel
 * name. For an exact-name match the auto-matcher (Tier 1) will re-derive it on
 * the next refresh — there is nothing to "unlink" in that case.
 *
 * Body: { itemId: string }
 */
export async function POST(request: Request) {
  return withTenantFromHeaders(async () => {
    const { itemId } = await request.json()
    if (!itemId) {
      return NextResponse.json({ error: 'Missing itemId' }, { status: 400 })
    }

    const item = await prisma.importItem.findUnique({
      where: { id: itemId },
      select: { id: true, type: true, status: true, batchId: true, matchedEntityId: true, data: true },
    })
    if (!item) {
      return NextResponse.json({ error: 'Import item not found' }, { status: 404 })
    }
    if (item.type !== 'CHANNEL') {
      return NextResponse.json({ error: 'Not a channel import item' }, { status: 400 })
    }
    // Once imported the channel entity is in use — unlinking is meaningless here.
    if (item.status === 'IMPORTED') {
      return NextResponse.json({ error: 'Item already imported' }, { status: 409 })
    }

    // Remove the import alias the link added on the currently-linked channel.
    const importName = (item.data as { name?: string } | null)?.name
    if (item.matchedEntityId && importName) {
      try {
        await removeChannelImportAlias(item.matchedEntityId, importName)
      } catch {
        // Channel may have been deleted, or the alias was already removed by
        // the user — either way the item still needs clearing below.
      }
    }

    // Clear the cached match so the item drops back into the resolution picker.
    await prisma.importItem.update({
      where: { id: item.id },
      data: {
        matchedEntityId: null,
        matchConfidence: null,
        matchDetails: null,
        status: 'NEW',
        blockedReason: null,
      },
    })

    // Recompute dependencies so dependent SET items re-block on the now-unresolved channel.
    await computeDependencies(item.batchId)

    return NextResponse.json({ success: true })
  })
}
