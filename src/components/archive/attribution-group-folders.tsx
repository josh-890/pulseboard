'use client'

import { AlertTriangle, Camera, Film } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHoverImagePreview, HoverImagePreview } from '@/components/shared/hover-image-preview'
import { PersonIdentity } from '@/components/shared/person-identity'

export type GroupFolder = {
  id: string
  folderName: string
  fullPath: string
  coverUrl: string | null
  isVideo: boolean
  suggestions: { icgId: string; name: string; tier: string; demotions: string[] }[]
  attributions: { icgId: string; name: string }[]
}

type AttributionGroupFoldersProps = {
  folders: GroupFolder[]
  votes: { icgId: string; name: string; folders: number }[]
  onConfirmOne: (icgId: string) => void
  busy: boolean
}

/**
 * The member folders of one group, as a contact sheet.
 *
 * The archive browser is a tree because channel + year is how the archive is
 * filed; here the question is different — "are these all the same person?" — and
 * that is answered by seeing the folders next to each other. Hence a grid, and
 * hence slice 1's covers: judging this from folder names alone is guesswork.
 *
 * A folder whose suggestion disagrees with the group is marked rather than
 * hidden. It is the most informative row on the page: either the alias is shared
 * or that one match is wrong, and both are worth seeing before confirming.
 */
export function AttributionGroupFolders({ folders, votes, onConfirmOne, busy }: AttributionGroupFoldersProps) {
  if (folders.length === 0) {
    return <p className="text-sm text-muted-foreground">No folders to show.</p>
  }

  const majority = votes[0]?.icgId ?? null
  const dissenting = folders.filter(
    (f) => f.suggestions.length > 0 && !f.suggestions.some((s) => s.icgId === majority),
  )

  return (
    <div className="space-y-3">
      {votes.length > 1 && majority && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Confirm only one:</span>
          {votes.map((v) => (
            <button
              key={v.icgId}
              onClick={() => onConfirmOne(v.icgId)}
              disabled={busy}
              className={cn(
                'rounded-full bg-background px-2.5 py-1 text-xs font-medium ring-1 ring-border transition-colors duration-150',
                'hover:bg-primary hover:text-primary-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              <PersonIdentity name={v.name} icgId={v.icgId} />{' '}
              <span className="tabular-nums opacity-70">{v.folders}</span>
            </button>
          ))}
          {dissenting.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {dissenting.length} folder(s) name someone else and are never swept along
            </span>
          )}
        </div>
      )}

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {folders.map((f) => (
          <FolderCard key={f.id} folder={f} majority={majority} />
        ))}
      </ul>
    </div>
  )
}

function FolderCard({ folder, majority }: { folder: GroupFolder; majority: string | null }) {
  const { ref, hover, pos, show, hide } = useHoverImagePreview(folder.coverUrl)
  const agrees = majority === null || folder.suggestions.some((s) => s.icgId === majority)
  const demoted = folder.suggestions.some((s) => s.demotions.length > 0)
  const Icon = folder.isVideo ? Film : Camera

  return (
    <li
      className={cn(
        'overflow-hidden rounded-md border bg-background/60 transition-colors duration-150',
        agrees ? 'border-border/60' : 'border-amber-500/50',
      )}
    >
      <div ref={ref} className="relative aspect-[4/3] bg-muted" onMouseEnter={show} onMouseLeave={hide}>
        {folder.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- MinIO-signed URL, not a static asset
          <img src={folder.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Icon className="h-6 w-6" />
          </span>
        )}
        {folder.attributions.length > 0 && (
          <span className="absolute left-1 top-1 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
            attributed
          </span>
        )}
        {demoted && (
          <span
            className="absolute right-1 top-1 rounded bg-amber-500/90 p-1 text-white"
            title="This suggestion carries a demotion — a cross-label channel, an undefined channel, or an unresolved ambiguity"
          >
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
      </div>
      <div className="p-2">
        <p className="truncate text-xs" title={folder.fullPath}>
          {folder.folderName}
        </p>
        {/* The suggested person, always with the ICG-ID: many people are called
            "Alisa", and only Name (ICG-ID) says which one this folder means. */}
        <div className={cn('mt-0.5 flex flex-col gap-0.5 text-xs', agrees ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400')}>
          {folder.suggestions.length === 0 ? (
            <span>no suggestion</span>
          ) : (
            folder.suggestions.map((s) => (
              <PersonIdentity key={s.icgId} name={s.name} icgId={s.icgId} className="min-w-0" />
            ))
          )}
        </div>
      </div>
      {hover && pos && folder.coverUrl && (
        <HoverImagePreview url={folder.coverUrl} alt={folder.folderName} pos={pos} />
      )}
    </li>
  )
}
