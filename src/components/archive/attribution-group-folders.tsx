'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Camera, Check, Film, Loader2, SkipForward, Undo2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHoverImagePreview, HoverImagePreview } from '@/components/shared/hover-image-preview'
import { PersonIdentity } from '@/components/shared/person-identity'
import { candidatesForFolder } from '@/lib/attribution-candidates'

export type GroupFolder = {
  id: string
  folderName: string
  fullPath: string
  coverUrl: string | null
  isVideo: boolean
  suggestions: { icgId: string; name: string; tier: string; demotions: string[] }[]
  attributions: { icgId: string; name: string }[]
  identity: 'OPEN' | 'CONFIRMED' | 'REJECTED' | 'SKIPPED'
  matcherSuggestion: {
    kind: 'staging' | 'set'
    id: string
    title: string
    releaseDate: string | null
    channelName: string | null
    confidence: string | null
    agrees: { date: boolean; title: boolean }
  } | null
}

type Vote = { icgId: string; name: string; folders: number }

type AttributionGroupFoldersProps = {
  folders: GroupFolder[]
  votes: Vote[]
  busy: string | null
  onConfirm: (folderId: string, icgIds: string[], names: Record<string, string>) => void
  onConfirmMany: (folderIds: string[], icgIds: string[], names: Record<string, string>) => void
  onReject: (folderId: string) => void
  onSkip: (folderId: string) => void
  onUndo: (folderId: string) => void
}

/**
 * The member folders of one group — and the surface where every decision is made.
 *
 * A contact sheet rather than a tree: the question here is "are these all the
 * same person?", and it is answered by seeing folders next to each other. `AA |
 * Anna` is the case that forced this — one alias, several genuinely different
 * people, distinguishable only side by side.
 *
 * The commit is per card. The group-level confirm this replaced could attach a
 * person to 204 folders from one click; FamilySearch, whose problem is the same
 * kind and the same stakes, offers no bulk accept at all, and Apple Photos' batch
 * confirm is documented merging two people into one album. Speed comes from the
 * keyboard instead: annotation research measured >10x throughput from near-binary,
 * one-question-at-a-time review.
 */
export function AttributionGroupFolders({
  folders,
  votes,
  busy,
  onConfirm,
  onConfirmMany,
  onReject,
  onSkip,
  onUndo,
}: AttributionGroupFoldersProps) {
  const [focus, setFocus] = useState(0)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLLIElement>>(new Map())

  const openCount = useMemo(() => folders.filter((f) => f.identity === 'OPEN').length, [folders])
  const nameOf = useMemo(() => {
    const m: Record<string, string> = {}
    for (const v of votes) m[v.icgId] = v.name
    for (const f of folders) for (const s of f.suggestions) m[s.icgId] ??= s.name
    return m
  }, [folders, votes])

  const focused = folders[focus]
  const candidates = useMemo(
    () => (focused ? candidatesForFolder(focused.suggestions, votes) : []),
    [focused, votes],
  )

  const move = useCallback(
    (delta: number) => setFocus((i) => Math.min(folders.length - 1, Math.max(0, i + delta))),
    [folders.length],
  )

  // Keep the focused card in view without yanking the whole page around.
  useEffect(() => {
    const el = focused ? cardRefs.current.get(focused.id) : null
    el?.scrollIntoView({ block: 'nearest' })
  }, [focused])

  const toggleSelected = useCallback((id: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const f = folders[focus]
      if (!f) return

      // Digits pick the n-th candidate; everything else is a single-key verb.
      if (/^[1-9]$/.test(e.key)) {
        const c = candidates[Number(e.key) - 1]
        if (c) {
          e.preventDefault()
          onConfirm(f.id, [c.icgId], { [c.icgId]: c.name })
          move(1)
        }
        return
      }

      switch (e.key.toLowerCase()) {
        case 'j':
        case 'arrowright':
          e.preventDefault()
          if (e.shiftKey) toggleSelected(f.id)
          move(1)
          break
        case 'k':
        case 'arrowleft':
          e.preventDefault()
          if (e.shiftKey) toggleSelected(f.id)
          move(-1)
          break
        case 'a': {
          e.preventDefault()
          // Confirm everyone the folder ITSELF suggests — never the group's
          // verdict. A folder with no suggestion has nothing to confirm.
          const own = [...new Set(f.suggestions.map((s) => s.icgId))]
          if (own.length > 0) {
            onConfirm(f.id, own, nameOf)
            move(1)
          }
          break
        }
        case 'x':
          e.preventDefault()
          onReject(f.id)
          move(1)
          break
        case ' ':
          e.preventDefault()
          onSkip(f.id)
          move(1)
          break
        case 'u':
          e.preventDefault()
          onUndo(f.id)
          break
        case 's':
          e.preventDefault()
          toggleSelected(f.id)
          break
      }
    },
    [folders, focus, candidates, nameOf, move, onConfirm, onReject, onSkip, onUndo, toggleSelected],
  )

  if (folders.length === 0) {
    return <p className="text-sm text-muted-foreground">No folders to show.</p>
  }

  const selectedIds = [...selected]

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="listbox"
      aria-label="Folders in this group"
      className="space-y-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{openCount} open</span>
        <span><Key>J</Key>/<Key>K</Key> move</span>
        <span><Key>A</Key> confirm</span>
        <span><Key>X</Key> not this person</span>
        <span><Key>Space</Key> skip</span>
        <span><Key>U</Key> undo</span>
        <span><Key>1</Key>…<Key>9</Key> pick a person</span>
        <span><Key>S</Key> select</span>
      </div>

      {/* Candidates for the focused card. Digits map to this list, in this order. */}
      {focused && candidates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Focused folder is:</span>
          {candidates.slice(0, 9).map((c, i) => (
            <button
              key={c.icgId}
              onClick={() => {
                onConfirm(focused.id, [c.icgId], { [c.icgId]: c.name })
                move(1)
              }}
              disabled={!!busy}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 transition-colors duration-150',
                'hover:bg-primary hover:text-primary-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
                c.fromFolder ? 'bg-background ring-border' : 'bg-transparent ring-border/50',
              )}
              title={c.fromFolder ? 'Suggested for this folder' : 'Suggested elsewhere in this group'}
            >
              <Key>{String(i + 1)}</Key>
              <PersonIdentity name={c.name} icgId={c.icgId} />
            </button>
          ))}
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">{selectedIds.length} selected</span>
          {votes.map((v) => (
            <button
              key={v.icgId}
              onClick={() => {
                onConfirmMany(selectedIds, [v.icgId], nameOf)
                setSelected(new Set())
              }}
              disabled={!!busy}
              className={cn(
                'inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-xs ring-1 ring-border transition-colors duration-150',
                'hover:bg-primary hover:text-primary-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              Confirm as <PersonIdentity name={v.name} icgId={v.icgId} />
            </button>
          ))}
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {folders.map((f, i) => (
          <FolderCard
            key={f.id}
            folder={f}
            focused={i === focus}
            selected={selected.has(f.id)}
            busy={busy === f.id}
            registerRef={(el) => {
              if (el) cardRefs.current.set(f.id, el)
              else cardRefs.current.delete(f.id)
            }}
            onFocus={() => {
              setFocus(i)
              containerRef.current?.focus()
            }}
            onToggleSelect={() => toggleSelected(f.id)}
            onConfirm={() => {
              const own = [...new Set(f.suggestions.map((s) => s.icgId))]
              if (own.length > 0) onConfirm(f.id, own, nameOf)
            }}
            onReject={() => onReject(f.id)}
            onSkip={() => onSkip(f.id)}
            onUndo={() => onUndo(f.id)}
          />
        ))}
      </ul>
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px] leading-4">{children}</kbd>
  )
}

type FolderCardProps = {
  folder: GroupFolder
  focused: boolean
  selected: boolean
  busy: boolean
  registerRef: (el: HTMLLIElement | null) => void
  onFocus: () => void
  onToggleSelect: () => void
  onConfirm: () => void
  onReject: () => void
  onSkip: () => void
  onUndo: () => void
}

const STATE_STYLE: Record<GroupFolder['identity'], string> = {
  OPEN: 'border-border/60',
  CONFIRMED: 'border-emerald-500/60',
  REJECTED: 'border-rose-500/50',
  SKIPPED: 'border-border/40 opacity-60',
}

function FolderCard({
  folder,
  focused,
  selected,
  busy,
  registerRef,
  onFocus,
  onToggleSelect,
  onConfirm,
  onReject,
  onSkip,
  onUndo,
}: FolderCardProps) {
  const { ref, hover, pos, show, hide } = useHoverImagePreview(folder.coverUrl)
  const demoted = folder.suggestions.some((s) => s.demotions.length > 0)
  const Icon = folder.isVideo ? Film : Camera
  const decided = folder.identity !== 'OPEN'

  return (
    <li
      ref={registerRef}
      onClick={onFocus}
      className={cn(
        'group/card overflow-hidden rounded-md border bg-background/60 transition-shadow duration-150',
        STATE_STYLE[folder.identity],
        focused && 'ring-2 ring-primary ring-offset-1',
        selected && !focused && 'ring-2 ring-primary/60',
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

        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          aria-label={selected ? 'Deselect folder' : 'Select folder'}
          aria-pressed={selected}
          className={cn(
            'absolute left-1 top-1 h-5 w-5 rounded border border-border bg-background/80 text-primary transition-opacity duration-150',
            'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selected ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100',
          )}
        >
          {selected && <Check className="mx-auto h-3.5 w-3.5" />}
        </button>

        {decided && (
          <span
            className={cn(
              'absolute right-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white',
              folder.identity === 'CONFIRMED' && 'bg-emerald-600/90',
              folder.identity === 'REJECTED' && 'bg-rose-600/90',
              folder.identity === 'SKIPPED' && 'bg-muted-foreground/80',
            )}
          >
            {folder.identity.toLowerCase()}
          </span>
        )}
        {!decided && demoted && (
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

        {/* What the archive matcher proposes — shown, never acted on. It used to
            hide the folder from this queue entirely; 14% of live suggestions
            agreed with their folder on neither date nor title. */}
        {folder.matcherSuggestion && (
          <p
            className={cn(
              'mt-1 truncate rounded px-1 py-0.5 text-[10px]',
              folder.matcherSuggestion.agrees.date || folder.matcherSuggestion.agrees.title
                ? 'bg-muted text-muted-foreground'
                : 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
            )}
            title={`Matcher suggests "${folder.matcherSuggestion.title}" (${folder.matcherSuggestion.releaseDate ?? 'no date'}${folder.matcherSuggestion.channelName ? `, ${folder.matcherSuggestion.channelName}` : ''})${
              folder.matcherSuggestion.agrees.date || folder.matcherSuggestion.agrees.title
                ? ''
                : ' — agrees on neither the date nor the title'
            }`}
          >
            link? {folder.matcherSuggestion.title}
            {!folder.matcherSuggestion.agrees.date && !folder.matcherSuggestion.agrees.title && ' ⚠'}
          </p>
        )}
        {/* Always Name (ICG-ID): many people are called "Alisa", and only the key
            says which one this folder means. */}
        <div className="mt-0.5 flex flex-col gap-0.5 text-xs text-muted-foreground">
          {decided && folder.attributions.length > 0 ? (
            folder.attributions.map((a) => (
              <PersonIdentity
                key={a.icgId}
                name={a.name}
                icgId={a.icgId}
                className="min-w-0 text-emerald-700 dark:text-emerald-400"
              />
            ))
          ) : folder.suggestions.length === 0 ? (
            <span>no suggestion</span>
          ) : (
            folder.suggestions.map((s) => (
              <PersonIdentity key={s.icgId} name={s.name} icgId={s.icgId} className="min-w-0" />
            ))
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-1">
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : decided ? (
            <CardButton onClick={onUndo} label="Undo" icon={Undo2} />
          ) : (
            <>
              <CardButton
                onClick={onConfirm}
                label="Confirm"
                icon={Check}
                tone="primary"
                disabled={folder.suggestions.length === 0}
              />
              <CardButton onClick={onReject} label="Not this person" icon={X} />
              <CardButton onClick={onSkip} label="Skip" icon={SkipForward} />
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

function CardButton({
  onClick,
  label,
  icon: Icon,
  tone = 'default',
  disabled,
}: {
  onClick: () => void
  label: string
  icon: typeof Check
  tone?: 'primary' | 'default'
  disabled?: boolean
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center rounded p-1 transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-40',
        tone === 'primary'
          ? 'text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}
