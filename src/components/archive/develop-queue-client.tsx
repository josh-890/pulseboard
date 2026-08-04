'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Camera, Clock, Film, Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PersonIdentity } from '@/components/shared/person-identity'
import { useHoverImagePreview, HoverImagePreview } from '@/components/shared/hover-image-preview'
import { developFolderAction, waitOnFolderAction } from '@/lib/actions/attribution-actions'

export type DevelopFolder = {
  id: string
  folderName: string
  fullPath: string
  coverUrl: string | null
  isVideo: boolean
  /** A StagingSet this folder already is — develop links to it rather than duplicating. */
  existingStaging: {
    id: string
    title: string
    releaseDate: string | null
    channelName: string | null
    channelAgrees: boolean
  } | null
}

export type DevelopPersonRow = {
  icgId: string
  name: string
  personId: string | null
  contactId: string | null
  folders: DevelopFolder[]
}

/**
 * Stage 2: which confirmed archive folders should become staging sets.
 *
 * Grouped by person rather than by channel, because that is what the question is
 * about — "do I want this person's sets in the app now, or wait for their import
 * file?" Stage 1 asked about a channel's alias; a different question deserves a
 * different grouping and its own pass.
 *
 * Still one folder per decision. The reason is the same as in stage 1, and it is
 * not about danger here so much as about judgement: whether a set is worth
 * materialising is a per-set call.
 */
export function DevelopQueueClient({ people }: { people: DevelopPersonRow[] }) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null)
  const [active, setActive] = useState<string | null>(people[0]?.icgId ?? null)
  const [focus, setFocus] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const visible = useMemo(
    () =>
      people
        .map((p) => ({ ...p, folders: p.folders.filter((f) => !dismissed.has(f.id)) }))
        .filter((p) => p.folders.length > 0),
    [people, dismissed],
  )

  const current = visible.find((p) => p.icgId === active) ?? visible[0]
  const totalFolders = visible.reduce((n, p) => n + p.folders.length, 0)

  const run = useCallback(
    async (folderId: string, op: 'develop' | 'wait') => {
      setBusy(folderId)
      const res = op === 'develop' ? await developFolderAction(folderId) : await waitOnFolderAction(folderId)
      setBusy(null)
      if (!res.success) {
        setFlash({ text: res.error, tone: 'err' })
        return
      }
      setDismissed((d) => new Set(d).add(folderId))
      const linked = 'data' in res && res.data && 'linkedExisting' in res.data && res.data.linkedExisting
      const n = 'data' in res && res.data && 'participants' in res.data ? res.data.participants : 1
      setFlash({
        text:
          op === 'wait'
            ? 'Parked — it will arrive with the person’s import'
            : linked
              ? `Linked to the staging set that already existed (${n} participant(s) added)`
              : `Staging set created with ${n} participant(s)`,
        tone: 'ok',
      })
      router.refresh()
    },
    [router],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !current) return
      const f = current.folders[focus]
      const move = (d: number) => setFocus((i) => Math.min(current.folders.length - 1, Math.max(0, i + d)))
      switch (e.key.toLowerCase()) {
        case 'j':
        case 'arrowright':
          e.preventDefault()
          move(1)
          break
        case 'k':
        case 'arrowleft':
          e.preventDefault()
          move(-1)
          break
        case 'e':
          if (f) {
            e.preventDefault()
            run(f.id, 'develop')
          }
          break
        case 'w':
          if (f) {
            e.preventDefault()
            run(f.id, 'wait')
          }
          break
      }
    },
    [current, focus, run],
  )

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Develop archive sets</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Folders whose person is confirmed but which have no staging set yet. Develop the ones you
          want in the app now; park the rest and they will arrive with that person’s import file.{' '}
          <Link href="/archive/attribution" className="underline underline-offset-2 hover:text-foreground">
            Back to attribution
          </Link>
        </p>
        <p className="mt-3 text-sm">
          <span className="font-semibold tabular-nums">{totalFolders.toLocaleString()}</span>{' '}
          <span className="text-muted-foreground">
            folder{totalFolders === 1 ? '' : 's'} across {visible.length} person
            {visible.length === 1 ? '' : 's'}
          </span>
        </p>
      </header>

      {flash && (
        <p
          className={cn(
            'mb-4 rounded-md px-3 py-2 text-sm',
            flash.tone === 'ok'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-destructive/10 text-destructive',
          )}
          role="status"
        >
          {flash.text}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing waiting. Confirm folders in the attribution queue and they appear here.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
          <nav aria-label="People with confirmed folders" className="space-y-1">
            {visible.map((p) => (
              <button
                key={p.icgId}
                onClick={() => {
                  // Reset focus on the event, not in an effect: the React
                  // Compiler rejects setState inside useEffect, and switching
                  // person is precisely an event.
                  setActive(p.icgId)
                  setFocus(0)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  p.icgId === current?.icgId
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <PersonIdentity name={p.name} icgId={p.icgId} className="min-w-0" />
                <span className="shrink-0 tabular-nums opacity-80">{p.folders.length}</span>
              </button>
            ))}
          </nav>

          {current && (
            <div
              ref={containerRef}
              tabIndex={0}
              onKeyDown={onKeyDown}
              className="space-y-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  <PersonIdentity name={current.name} icgId={current.icgId} />
                </span>
                {current.personId ? (
                  <Link href={`/people/${current.personId}`} className="underline underline-offset-2">
                    curated person
                  </Link>
                ) : (
                  <span>contact only — not curated yet</span>
                )}
                <span className="ml-auto">
                  <Kbd>J</Kbd>/<Kbd>K</Kbd> move · <Kbd>E</Kbd> develop · <Kbd>W</Kbd> wait
                </span>
              </div>

              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {current.folders.map((f, i) => (
                  <DevelopCard
                    key={f.id}
                    folder={f}
                    focused={i === focus}
                    busy={busy === f.id}
                    onFocus={() => {
                      setFocus(i)
                      containerRef.current?.focus()
                    }}
                    onDevelop={() => run(f.id, 'develop')}
                    onWait={() => run(f.id, 'wait')}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px] leading-4">{children}</kbd>
  )
}

function DevelopCard({
  folder,
  focused,
  busy,
  onFocus,
  onDevelop,
  onWait,
}: {
  folder: DevelopFolder
  focused: boolean
  busy: boolean
  onFocus: () => void
  onDevelop: () => void
  onWait: () => void
}) {
  const { ref, hover, pos, show, hide } = useHoverImagePreview(folder.coverUrl)
  const Icon = folder.isVideo ? Film : Camera

  return (
    <li
      onClick={onFocus}
      className={cn(
        'overflow-hidden rounded-md border border-border/60 bg-background/60 transition-shadow duration-150',
        focused && 'ring-2 ring-primary ring-offset-1',
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
      </div>
      <div className="p-2">
        <p className="truncate text-xs" title={folder.fullPath}>
          {folder.folderName}
        </p>
        {/* This set already exists in staging — developing links to it instead of
            creating a second copy of curated work. */}
        {folder.existingStaging && (
          <p
            className={cn(
              'mt-1 truncate rounded px-1 py-0.5 text-[10px]',
              folder.existingStaging.channelAgrees
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
            )}
            title={`Already in staging: "${folder.existingStaging.title}" (${folder.existingStaging.releaseDate ?? 'no date'}${folder.existingStaging.channelName ? `, ${folder.existingStaging.channelName}` : ''})${
              folder.existingStaging.channelAgrees ? '' : ' — but the channel disagrees, check before linking'
            }`}
          >
            exists: {folder.existingStaging.title}
            {!folder.existingStaging.channelAgrees && ' ⚠'}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-1">
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDevelop()
                }}
                title={folder.existingStaging ? 'Link to the existing staging set' : 'Develop into a staging set'}
                aria-label={folder.existingStaging ? 'Link to the existing staging set' : 'Develop into a staging set'}
                className="inline-flex items-center justify-center rounded p-1 text-emerald-700 transition-colors duration-150 hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-400"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onWait()
                }}
                title="Wait for the person’s import"
                aria-label="Wait for the person’s import"
                className="inline-flex items-center justify-center rounded p-1 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Clock className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
      {hover && pos && folder.coverUrl && (
        <HoverImagePreview url={folder.coverUrl} alt={folder.folderName} pos={pos} />
      )}
    </li>
  )
}
