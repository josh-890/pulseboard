'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { HelpCircle, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { EntityTagList } from '@/components/tags/entity-tag-list'
import { TagPalette } from '@/components/tags/tag-palette'
import { useEntityTags } from '@/hooks/use-entity-tags'
import { resolveDiskTagNameAction } from '@/lib/actions/archive-tag-actions'
import type { FolderTagsView } from '@/lib/services/archive-tag-service'
import type { PaletteTag } from '@/lib/services/tag-service'
import { cn } from '@/lib/utils'

type ArchiveFolderTagsProps = {
  view: FolderTagsView
  className?: string
  /** Control the palette from outside (workbench `T`); internal state otherwise */
  paletteOpen?: boolean
  onPaletteOpenChange?: (open: boolean) => void
}

/**
 * A folder's tags on the archive list and the staging panel (ADR-0034). Before
 * promotion they are the folder's own; once a confirmed link joins it to a Set
 * the row edits the Set's tags. Either way the next scan writes them to
 * `.pulseboard\` as `#name` files. Markers the app could not place are shown
 * apart: an unknown name opens the palette to say which tag it means.
 */
export function ArchiveFolderTags({ view, className, paletteOpen: openProp, onPaletteOpenChange }: ArchiveFolderTagsProps) {
  const router = useRouter()
  const controller = useEntityTags(view.owner.type, view.owner.id, view.tags)
  const [openState, setOpenState] = useState(false)
  const paletteOpen = openProp ?? openState
  const setPaletteOpen = (o: boolean) => {
    setOpenState(o)
    onPaletteOpenChange?.(o)
  }
  const [resolving, setResolving] = useState<string | null>(null)
  const [unknown, setUnknown] = useState(view.unknown)
  const [isPending, startTransition] = useTransition()

  function resolve(marker: string, tag: PaletteTag) {
    startTransition(async () => {
      const res = await resolveDiskTagNameAction(marker, tag.id)
      if (!res.success) {
        toast.error(res.error)
        return
      }
      setUnknown((u) => u.filter((m) => m !== marker))
      controller?.refresh()
      toast.success(
        `${marker} now means ${tag.group.name}: ${tag.name}` +
          (res.folders > 1 ? ` — adopted on ${res.folders} folders` : ''),
      )
      router.refresh()
    })
  }

  if (!controller) return null
  const onSet = view.owner.type === 'SET'

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', isPending && 'opacity-60', className)}>
      {onSet && controller.tags.length > 0 && (
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70" title="Tags of the linked set">
          set
        </span>
      )}
      <EntityTagList
        tags={controller.tags}
        isLoading={controller.isLoading}
        onRemove={controller.remove}
        onAdd={() => setPaletteOpen(true)}
      />
      {unknown.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setResolving(m)}
          title={`Unknown tag marker in .pulseboard\\ — click to say which tag "${m}" means`}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 transition-colors duration-150 hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:text-amber-400"
        >
          <HelpCircle size={11} aria-hidden="true" />
          {m}
        </button>
      ))}
      {view.conflicts.length > 0 && (
        <span
          title="One exclusive group has more than one marker in .pulseboard\ — nothing was adopted for it. Delete the wrong file in Explorer."
          className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs text-red-600 dark:text-red-400"
        >
          <TriangleAlert size={11} aria-hidden="true" />
          {view.conflicts.join(' + ')}
        </span>
      )}
      <TagPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        entityType={view.owner.type}
        selectedTagIds={controller.directTagIds}
        onToggle={controller.toggle}
      />
      {resolving && (
        <TagPalette
          key={resolving}
          open
          onOpenChange={(o) => {
            if (!o) setResolving(null)
          }}
          entityType="ARCHIVE_FOLDER"
          title={`Which tag does ${resolving} mean?`}
          initialQuery={resolving.replace(/^#/, '').replace(/^[^=]*=/, '').replace(/_/g, ' ')}
          onPick={(tag) => {
            const marker = resolving
            setResolving(null)
            resolve(marker, tag)
          }}
        />
      )}
    </div>
  )
}
