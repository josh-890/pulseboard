'use client'

import { useEffect, useState } from 'react'
import { getFolderTagsViewAction } from '@/lib/actions/archive-tag-actions'
import type { FolderTagsView } from '@/lib/services/archive-tag-service'
import { ArchiveFolderTags } from './archive-folder-tags'

type ArchiveFolderTagsLoaderProps = {
  folderId: string
  className?: string
  paletteOpen?: boolean
  onPaletteOpenChange?: (open: boolean) => void
}

/** `ArchiveFolderTags` for a folder known only by id (staging slide panel) */
export function ArchiveFolderTagsLoader({ folderId, className, paletteOpen, onPaletteOpenChange }: ArchiveFolderTagsLoaderProps) {
  const [loaded, setLoaded] = useState<{ folderId: string; view: FolderTagsView | null } | null>(null)

  useEffect(() => {
    let alive = true
    getFolderTagsViewAction(folderId)
      .then((view) => {
        if (alive) setLoaded({ folderId, view })
      })
      .catch(() => {
        if (alive) setLoaded({ folderId, view: null })
      })
    return () => {
      alive = false
    }
  }, [folderId])

  if (!loaded || loaded.folderId !== folderId) {
    return <span className="text-xs text-muted-foreground">Loading tags…</span>
  }
  if (!loaded.view) return <span className="text-xs text-muted-foreground">Tags unavailable</span>
  return (
    <ArchiveFolderTags
      key={folderId}
      view={loaded.view}
      className={className}
      paletteOpen={paletteOpen}
      onPaletteOpenChange={onPaletteOpenChange}
    />
  )
}
