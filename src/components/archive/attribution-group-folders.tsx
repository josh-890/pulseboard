'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Camera, Check, Film, Loader2, SkipForward, Undo2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PersonIdentity } from '@/components/shared/person-identity'
import { candidatesForFolder } from '@/lib/attribution-candidates'
import { AttributionDecisionBar, type FolderFilter, type PersonReference } from './attribution-decision-bar'
import { PersonAssignPicker, type AssignablePerson } from './person-assign-picker'

export type GroupFolder = {
  id: string
  folderName: string
  fullPath: string
  coverUrl: string | null
  isVideo: boolean
  suggestions: { icgId: string; name: string; tier: string; demotions: string[] }[]
  attributions: { icgId: string; name: string }[]
  identity: 'OPEN' | 'CONFIRMED' | 'REJECTED' | 'SKIPPED'
  rejectedIcgIds: string[]
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
  references: PersonReference[]
  busy: string | null
  onConfirm: (folderId: string, icgIds: string[], names: Record<string, string>) => void
  onConfirmMany: (folderIds: string[], icgIds: string[], names: Record<string, string>) => void
  onRejectCandidate: (folderId: string, icgId: string, remaining: number) => void
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
  references,
  busy,
  onConfirm,
  onConfirmMany,
  onRejectCandidate,
  onSkip,
  onUndo,
}: AttributionGroupFoldersProps) {
  const [filter, setFilter] = useState<FolderFilter>('open')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [focus, setFocus] = useState(0)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLUListElement>(null)
  const cardRefs = useRef<Map<string, HTMLLIElement>>(new Map())

  /**
   * How many cards sit in a row, read from the rendered grid.
   *
   * Up/Down have to move by a row or the arrow keys are a lie in a 2-D layout —
   * and worse, they scroll the page instead. The column count is responsive
   * (2/3/4), so it is measured rather than assumed.
   */
  const columns = useCallback(() => {
    const el = gridRef.current
    if (!el) return 1
    const cols = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length
    return Math.max(1, cols)
  }, [])

  const refMap = useMemo(() => new Map(references.map((r) => [r.icgId, r])), [references])

  const counts = useMemo(() => {
    const open = folders.filter((f) => f.identity === 'OPEN').length
    return { open, decided: folders.length - open, total: folders.length }
  }, [folders])

  // Decided folders leave the working set — Lightroom's Named/Unnamed split. They
  // leave the KEYBOARD's path too: hiding a card while the cursor still walks
  // through it would be worse than not hiding it at all.
  const visible = useMemo(
    () =>
      filter === 'all'
        ? folders
        : filter === 'decided'
          ? folders.filter((f) => f.identity !== 'OPEN')
          : folders.filter((f) => f.identity === 'OPEN'),
    [folders, filter],
  )
  const nameOf = useMemo(() => {
    const m: Record<string, string> = {}
    for (const v of votes) m[v.icgId] = v.name
    for (const f of folders) for (const s of f.suggestions) m[s.icgId] ??= s.name
    return m
  }, [folders, votes])

  const focused = visible[Math.min(focus, Math.max(0, visible.length - 1))]
  const candidates = useMemo(
    () => (focused ? candidatesForFolder(focused.suggestions, votes, focused.rejectedIcgIds) : []),
    [focused, votes],
  )

  const move = useCallback(
    (delta: number) => setFocus((i) => Math.min(visible.length - 1, Math.max(0, i + delta))),
    [visible.length],
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
      const f = visible[focus]
      if (!f) return

      // Digits pick the n-th candidate. Read from e.code, not e.key: with Shift
      // held a digit key reports punctuation ("!"), and on a German layout it
      // does so differently again — the physical key is the stable signal.
      const digit = /^Digit([1-9])$/.exec(e.code)
      if (digit) {
        const c = candidates[Number(digit[1]) - 1]
        if (c) {
          e.preventDefault()
          onConfirm(f.id, [c.icgId], { [c.icgId]: c.name })
          // Shift ADDS a person and stays on the card, so a set with several
          // participants is built up one key at a time. Confirming is additive —
          // it upserts, it never replaces — so Shift+1 Shift+2 leaves both on the
          // folder. Without Shift the common case stays one keystroke.
          if (!e.shiftKey) move(1)
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
        // A grid needs vertical movement too. Without these the browser scrolls
        // the page, which is both useless and disorienting mid-review.
        case 'arrowdown':
          e.preventDefault()
          if (e.shiftKey) toggleSelected(f.id)
          move(columns())
          break
        case 'arrowup':
          e.preventDefault()
          if (e.shiftKey) toggleSelected(f.id)
          move(-columns())
          break
        case 'home':
          e.preventDefault()
          setFocus(0)
          break
        case 'end':
          e.preventDefault()
          setFocus(visible.length - 1)
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
        case 'x': {
          e.preventDefault()
          // Drop the top candidate, not the card. Rejecting used to answer "not
          // this person" and close the folder, losing the operator's place in the
          // question they were actually working on. Only an empty candidate list
          // closes it — and then the focus moves on by itself.
          const top = candidates[0]
          if (top) {
            onRejectCandidate(f.id, top.icgId, candidates.length)
            if (candidates.length <= 1) move(1)
          }
          break
        }
        case '/':
          e.preventDefault()
          setPickerOpen(true)
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
    [visible, focus, candidates, nameOf, move, columns, onConfirm, onRejectCandidate, onSkip, onUndo, toggleSelected],
  )

  if (folders.length === 0) {
    return <p className="text-sm text-muted-foreground">No folders to show.</p>
  }

  const selectedIds = [...selected]

  return (
    <>
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="listbox"
      aria-label="Folders in this group"
      className="space-y-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <AttributionDecisionBar
        filter={filter}
        onFilter={(f) => {
          setFilter(f)
          setFocus(0)
        }}
        counts={counts}
        candidates={candidates}
        references={refMap}
        focusedCoverUrl={focused?.coverUrl ?? null}
        focusedName={focused?.folderName ?? null}
        busy={!!busy}
        onPick={(c) => {
          if (!focused) return
          onConfirm(focused.id, [c.icgId], { [c.icgId]: c.name })
          move(1)
        }}
        onOpenPicker={() => setPickerOpen(true)}
      />

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

      {/* Portrait, uncropped, and only three across on a normal laptop. The page
          gets longer; the covers get readable, which is what the decision needs. */}
      <ul ref={gridRef} className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {visible.map((f, i) => (
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
            onReject={() => {
              const cs = candidatesForFolder(f.suggestions, votes, f.rejectedIcgIds)
              if (cs[0]) onRejectCandidate(f.id, cs[0].icgId, cs.length)
            }}
            onSkip={() => onSkip(f.id)}
            onUndo={() => onUndo(f.id)}
          />
        ))}
      </ul>

    </div>

      <PersonAssignPicker
        open={pickerOpen}
        targetLabel={
          selectedIds.length > 0
            ? `${selectedIds.length} selected folder(s)`
            : (focused?.folderName ?? 'the focused folder')
        }
        onAssign={(p: AssignablePerson) => {
          setPickerOpen(false)
          if (selectedIds.length > 0) {
            onConfirmMany(selectedIds, [p.icgId], { [p.icgId]: p.name })
            setSelected(new Set())
          } else if (focused) {
            onConfirm(focused.id, [p.icgId], { [p.icgId]: p.name })
          }
          containerRef.current?.focus()
        }}
        onClose={() => {
          setPickerOpen(false)
          containerRef.current?.focus()
        }}
      />
    </>
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
  const demoted = folder.suggestions.some((s) => s.demotions.length > 0)
  const Icon = folder.isVideo ? Film : Camera
  const decided = folder.identity !== 'OPEN'

  return (
    <li
      ref={registerRef}
      role="option"
      aria-selected={focused}
      onClick={onFocus}
      className={cn(
        'group/card overflow-hidden rounded-md border bg-background/60 transition-shadow duration-150',
        STATE_STYLE[folder.identity],
        selected && !focused && 'ring-2 ring-primary/60',
        // The focus marker is a ring and nothing else. No scaling, no preview
        // panel: the covers are shown large and uncropped from the start, so
        // there is nothing left to reveal — and a card that jumps in size on
        // every keystroke makes a keyboard pass restless to read.
        focused && 'ring-2 ring-primary ring-offset-2',
      )}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-muted/60">
        {folder.coverUrl ? (
          // object-contain, never object-cover: cropping a cover to a fixed box
          // throws away exactly the part that decides whether this is the person.
          // eslint-disable-next-line @next/next/no-img-element -- MinIO-signed URL, not a static asset
          <img src={folder.coverUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
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
          {folder.attributions.length > 0 ? (
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
