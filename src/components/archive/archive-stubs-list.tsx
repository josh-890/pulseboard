'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FolderClock, FolderSync, Hourglass, Layers, TriangleAlert } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import { ArchiveCoverThumb } from './archive-cover-thumb'
import { ArchiveStubControl } from './archive-stub-control'
import type { ArchiveStubEntry } from '@/lib/services/archive-stub-service'

type View = 'all' | 'touched'

export type ArchiveStubsListProps = { items: ArchiveStubEntry[] }

/**
 * The Stubs view (ADR-0032 §7): every folder filed as a placeholder, the ones
 * whose folder changed after it was marked first — those may be the real set by
 * now. End stub sits in the row; an ended stub leaves the list.
 */
export function ArchiveStubsList({ items }: ArchiveStubsListProps) {
  const router = useRouter()
  const [ended, setEnded] = useState<Set<string>>(() => new Set())
  const [view, setView] = useState<View>('all')

  const live = items.filter((it) => !ended.has(it.id))
  const touched = live.filter((it) => it.touchedSinceStub).length
  const shown = view === 'touched' ? live.filter((it) => it.touchedSinceStub) : live

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <div>
        <Link
          href="/archive"
          className="inline-flex items-center gap-1 rounded-md text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft size={12} /> Archive
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <Hourglass size={20} className="text-violet-500" aria-hidden />
          <h1 className="text-2xl font-bold">Stubs</h1>
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">
            {live.length}
          </span>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Folders filed on purpose as a placeholder until the real set arrives. Once the folder holds the real set,
          press the <span className="font-medium text-violet-700 dark:text-violet-300">Stub</span> pill →{' '}
          <span className="font-medium">End stub</span>.
        </p>
      </div>

      <div role="radiogroup" aria-label="Show" className="inline-flex w-fit rounded-full border border-border/50 bg-muted/40 p-0.5 text-xs">
        {(
          [
            ['all', 'All', live.length],
            ['touched', 'Changed since marked', touched],
          ] as const
        ).map(([v, label, n]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={view === v}
            data-testid={`stubs-view-${v}`}
            onClick={() => setView(v)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              view === v ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
            <span className="tabular-nums opacity-70">{n}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-white/20 bg-card/70 p-6 text-sm text-muted-foreground shadow-md backdrop-blur-sm">
          {view === 'touched'
            ? 'No stub folder changed since it was marked.'
            : 'No stubs — every archive copy is the real set.'}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((it) => (
            <StubRow
              key={it.id}
              item={it}
              onEnded={() => {
                setEnded((s) => new Set(s).add(it.id))
                router.refresh()
              }}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function StubRow({ item, onEnded }: { item: ArchiveStubEntry; onEnded: () => void }) {
  const [stub, setStub] = useState(item.stub)
  const next = nextStep(item)

  return (
    <li
      data-testid="stub-row"
      data-folder-id={item.id}
      data-touched={item.touchedSinceStub}
      className={cn(
        'flex flex-col gap-2 rounded-xl border px-4 py-3 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:gap-3',
        item.touchedSinceStub ? 'border-violet-500/40 bg-violet-500/5' : 'border-border/40 bg-card/70',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <ArchiveCoverThumb
          folderId={item.id}
          coverUrl={item.coverUrl}
          coverError={item.coverError}
          isVideo={item.isVideo}
          folderName={item.folderName}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium" title={item.fullPath}>
              {item.folderName}
            </span>
            {item.touchedSinceStub && (
              <span
                title={`Files were added, removed or renamed ${item.folderChangedAt ? formatRelativeTime(item.folderChangedAt) : ''} — after the folder was marked. The real set may be in now.`}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300"
              >
                <FolderSync size={10} aria-hidden />
                changed since marked
              </span>
            )}
            {item.missingOnDisk && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
                <TriangleAlert size={10} aria-hidden />
                gone from disk
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="tabular-nums" title="Files the last scan counted in the folder">
              {item.fileCount ?? '?'} {item.isVideo ? 'frames' : 'files'} on disk
            </span>
            {item.set && (
              <span className="tabular-nums">
                {item.set.photos} photo{item.set.photos === 1 ? '' : 's'} in the set
              </span>
            )}
            <span className="inline-flex items-center gap-1" title={item.folderChangedAt ? new Date(item.folderChangedAt).toLocaleString() : undefined}>
              <FolderClock size={10} aria-hidden />
              marked {formatRelativeTime(stub.since)}
              {item.folderChangedAt && <> · folder changed {formatRelativeTime(item.folderChangedAt)}</>}
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 pl-[4.25rem] sm:pl-0">
        {item.set ? (
          <Link
            href={`/sets/${item.set.id}`}
            className="inline-flex max-w-56 items-center gap-1 truncate rounded text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Layers size={12} aria-hidden className="shrink-0" />
            <span className="truncate">{item.set.title}</span>
          </Link>
        ) : item.stagingSet ? (
          <Link
            href={`/staging-sets?select=${item.stagingSet.id}`}
            className="inline-flex max-w-56 items-center gap-1 truncate rounded text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate">Staged: {item.stagingSet.title}</span>
          </Link>
        ) : null}
        <span className="text-[11px] text-muted-foreground" data-testid="stub-next-step">
          {next}
        </span>
        <ArchiveStubControl
          folderId={item.id}
          stub={stub}
          onChanged={(s) => {
            if (s) setStub(s)
            else onEnded()
          }}
        />
      </div>
    </li>
  )
}

/** What ending the stub sets in motion for this folder's set */
function nextStep(item: ArchiveStubEntry): string {
  if (item.set) {
    if (!item.set.hadMedia) return 'End it → the archive upload fills the set'
    return 'Had images once → the archive upload will not refill it; upload by hand'
  }
  if (item.stagingSet) return 'Promote it after ending → the archive upload fills it'
  return 'Not linked to a set'
}
