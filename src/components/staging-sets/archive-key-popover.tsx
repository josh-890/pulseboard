'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Check, FolderOpen, Inbox, Layers, Link2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { describeArchiveKeyDay } from '@/lib/archive-key'
import { confirmArchiveFolderLinkAction, getArchiveKeyFoldersAction } from '@/lib/actions/archive-actions'
import type { ArchiveKeyEntity, ArchiveKeyFolder, ArchiveKeyView } from '@/lib/services/archive-key-service'

export type ArchiveKeyPopoverProps = {
  stagingSetId: string
  /** The date as the row shows it — the trigger */
  label: string
  /** After a folder was linked here */
  onLinked?: () => void
}

const OPEN_DELAY = 300
const CLOSE_DELAY = 200
const FOLDER_RE = /^(\d{4}-\d{2}-\d{2}-[A-Za-z0-9]+)\s+(.+?)\s+([-–—])\s+(.+)$/

// Hovering a staged set's date lists the archive folders with its key — the
// same day and channel (Label siblings included) — and the near misses a date
// slip makes: ±2 days, day and month swapped (2026-10-25). Day and channel are
// what the archive rarely gets wrong, so the right folder is usually here even
// when the matcher guessed another; Link confirms it for this set.
export function ArchiveKeyPopover({ stagingSetId, label, onLinked }: ArchiveKeyPopoverProps) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [view, setView] = useState<ArchiveKeyView | null>(null)
  const [failed, setFailed] = useState(false)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [, startLink] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loading = useRef(false)

  const load = useCallback(async () => {
    if (loading.current) return
    loading.current = true
    setFailed(false)
    const res = await getArchiveKeyFoldersAction(stagingSetId)
    loading.current = false
    if (res) setView(res)
    else setFailed(true)
  }, [stagingSetId])

  const show = useCallback(() => {
    setOpen(true)
    if (!view) void load()
  }, [view, load])

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clear, [])

  const hoverIn = () => {
    clear()
    if (!open) timer.current = setTimeout(show, OPEN_DELAY)
  }
  const hoverOut = () => {
    clear()
    if (!pinned) timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY)
  }

  const link = (f: ArchiveKeyFolder) => {
    setLinkingId(f.id)
    startLink(async () => {
      const res = await confirmArchiveFolderLinkAction(f.id, stagingSetId, 'staging')
      setLinkingId(null)
      if (!res.success) {
        toast.error(res.error ?? 'Could not link the folder')
        return
      }
      toast.success(`Linked ${f.folderName}`)
      setOpen(false)
      setPinned(false)
      setView(null)
      onLinked?.()
    })
  }

  const same = view?.folders.filter((f) => f.kind === 'same') ?? []
  const near = view?.folders.filter((f) => f.kind !== 'same') ?? []

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Escape and a click outside close it, pinned or not
        if (!next) {
          setOpen(false)
          setPinned(false)
        }
      }}
    >
      <PopoverAnchor asChild>
        <button
          type="button"
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
          onClick={(e) => {
            e.stopPropagation()
            clear()
            if (open && pinned) {
              setOpen(false)
              setPinned(false)
            } else {
              setPinned(true)
              show()
            }
          }}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Archive folders on ${label} and the days around it`}
          className="shrink-0 rounded underline decoration-dotted decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {label}
        </button>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[min(36rem,calc(100vw-2rem))] p-0"
        onMouseEnter={clear}
        onMouseLeave={hoverOut}
        onClick={(e) => e.stopPropagation()}
        // Hover must not steal the focus from the list; a click does
        onOpenAutoFocus={(e) => {
          if (!pinned) e.preventDefault()
        }}
        aria-label="Archive folders with this key"
      >
        <div className="border-b px-3 py-2 text-xs">
          <span className="font-medium">Archive · </span>
          <span className="font-mono">{view?.key ?? label}</span>
          <span className="text-muted-foreground"> — the folders and sets of this day and channel, then ±2 days and day/month swapped</span>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {!view && !failed && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" /> Looking in the archive…
            </div>
          )}
          {failed && (
            <div className="px-3 py-3 text-xs text-destructive">
              Could not read the archive.{' '}
              <button type="button" onClick={() => void load()} className="underline">
                Try again
              </button>
            </div>
          )}
          {view && !view.key && (
            <p className="px-3 py-3 text-xs text-muted-foreground">This set has no date or no channel code to look up.</p>
          )}
          {view?.key && view.folders.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground">No folder on this day or near it.</p>
          )}
          {same.length > 0 && <Section title="Same day">{same.map(row)}</Section>}
          {view && view.sets.length > 0 && (
            <Section title={`Sets on this day (${view.sets.length})`}>
              {view.sets.map((e) => (
                <SetLine key={`${e.kind}-${e.id}`} entity={e} />
              ))}
            </Section>
          )}
          {near.length > 0 && <Section title="Near misses">{near.map(row)}</Section>}
        </div>
      </PopoverContent>
    </Popover>
  )

  function row(f: ArchiveKeyFolder) {
    const canLink = !view?.hasConfirmed && f.link.state !== 'confirmed'
    const offset = describeArchiveKeyDay(f.kind, f.offset)
    return (
      <li
        key={f.id}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 text-xs',
          f.link.state === 'confirmed' && !f.link.here && 'opacity-50',
        )}
      >
        <FolderOpen size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <FolderName name={f.folderName} sameDay={f.kind === 'same'} person={f.personMatches} title={f.titleMatches} />
          <div className="flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
            {offset && <span className="text-amber-600 dark:text-amber-400">{offset}</span>}
            {f.fileCount != null && <span>{f.fileCount} files</span>}
            <LinkState link={f.link} />
          </div>
        </div>
        {canLink && (
          <button
            type="button"
            onClick={() => link(f)}
            disabled={linkingId !== null}
            aria-label={`Link ${f.folderName} to this set`}
            className="flex shrink-0 items-center gap-1 rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-700 transition-colors hover:bg-green-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 dark:text-green-400"
          >
            {linkingId === f.id ? <Loader2 size={10} className="animate-spin" /> : <Link2 size={10} />}
            Link
          </button>
        )}
      </li>
    )
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul>{children}</ul>
    </section>
  )
}

/** The folder name with what agrees with this set in green, an off day in amber. */
function FolderName({ name, sameDay, person, title }: { name: string; sameDay: boolean; person: boolean; title: boolean }) {
  const m = name.match(FOLDER_RE)
  if (!m) return <span className="block truncate font-mono" title={name}>{name}</span>
  const ok = 'text-green-700 dark:text-green-400 font-medium'
  return (
    <span className="block truncate font-mono" title={name}>
      <span className={cn(!sameDay && 'text-amber-600 dark:text-amber-400')}>{m[1]}</span>{' '}
      <span className={cn(person && ok)}>{m[2]}</span> {m[3]} <span className={cn(title && ok)}>{m[4]}</span>
    </span>
  )
}

function LinkState({ link }: { link: ArchiveKeyFolder['link'] }) {
  if (link.state === 'free') return <span>free</span>
  const target = link.targetTitle ? `“${link.targetTitle}”` : 'another set'
  if (link.here) {
    return (
      <span className="flex items-center gap-0.5 text-green-700 dark:text-green-400">
        <Check size={9} aria-hidden="true" /> {link.state === 'confirmed' ? 'linked here' : 'suggested here'}
      </span>
    )
  }
  return <span>{link.state === 'confirmed' ? `linked to ${target}` : `suggested to ${target}`}</span>
}

/** A staged set or Set of the same day, with the folder it holds. */
function SetLine({ entity: e }: { entity: ArchiveKeyEntity }) {
  const Icon = e.kind === 'set' ? Layers : Inbox
  return (
    <li className={cn('flex items-start gap-2 px-3 py-1.5 text-xs', e.here && 'bg-primary/5')}>
      <Icon size={12} className="mt-0.5 shrink-0 text-muted-foreground" aria-label={e.kind === 'set' ? 'Set' : 'Staged set'} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate font-medium">{e.title}</span>
          {e.here && <span className="shrink-0 text-[10px] text-primary">this set</span>}
          {e.status && <span className="shrink-0 text-[10px] lowercase text-muted-foreground">{e.status}</span>}
        </div>
        {e.people.length > 0 && <div className="truncate text-[10px] text-muted-foreground">{e.people.join(', ')}</div>}
        <div className="truncate text-[10px]">
          {e.folder ? (
            <span className={cn('font-mono', e.folder.state === 'confirmed' ? 'text-green-700 dark:text-green-400' : 'text-amber-600 dark:text-amber-400')}>
              {e.folder.state === 'confirmed' ? 'linked' : 'suggested'}: {e.folder.name}
            </span>
          ) : (
            <span className="text-muted-foreground">no folder</span>
          )}
        </div>
      </div>
    </li>
  )
}
