'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Camera, Film, Grid2x2, Loader2, Rows3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { candidatesForFolder, type FolderCandidate } from '@/lib/attribution-candidates'
import {
  defaultMode,
  dominantCandidate,
  nextIndexAfterDecision,
  preloadWindow,
  sessionFolders,
  sessionProgress,
  type WorkbenchMode,
} from '@/lib/workbench-session'
import {
  confirmFolderAction,
  rejectCandidateAction,
  skipFolderAction,
  undoFolderAction,
} from '@/lib/actions/attribution-actions'
import { PersonAssignPicker, type AssignablePerson } from '@/components/archive/person-assign-picker'
import { WorkbenchFilmstrip } from './workbench-filmstrip'
import { WorkbenchInspector, type PersonReference } from './workbench-inspector'
import { PersonIdentity } from '@/components/shared/person-identity'

export type WorkbenchFolder = {
  id: string
  folderName: string
  fullPath: string
  coverUrl: string | null
  isVideo: boolean
  identity: 'OPEN' | 'CONFIRMED' | 'REJECTED' | 'SKIPPED'
  rejectedIcgIds: string[]
  suggestions: { icgId: string; name: string; tier: string; demotions: string[] }[]
  attributions: { icgId: string; name: string }[]
  matcherSuggestion: {
    title: string
    releaseDate: string | null
    channelName: string | null
    agrees: { date: boolean; title: boolean }
  } | null
}

export type WorkbenchData = {
  key: string
  channelShortName: string | null
  aliasToken: string | null
  votes: { icgId: string; name: string; folders: number }[]
  votedFolders: number
  folders: WorkbenchFolder[]
  references: PersonReference[]
  nextGroupKey: string | null
}

type Filter = 'open' | 'all' | 'decided'

/**
 * The workbench: one group, the whole screen, one question at a time.
 *
 * Split out of the queue because they are different jobs. The queue answers "what
 * do I work on next" and wants a scannable list; this answers "who is in this
 * set" and wants room. Growing the second inside the first left the important
 * task with whatever space the list did not use.
 *
 * The anatomy is Narrative Select's — large image, filmstrip beneath, inspector
 * beside — because culling software solves the same shape of problem: look, judge,
 * one key, next. `G` reaches the grid for the moments when the real question is
 * "are these the same person?", which a contact sheet answers and a single image
 * cannot.
 */
export function WorkbenchClient({ data, from = 'open' }: { data: WorkbenchData; from?: string }) {
  /** The queue view the operator came from, so leaving returns them to it. */
  const queueHref = from === 'open' ? '/archive/attribution' : `/archive/attribution?view=${from}`
  const router = useRouter()
  const [folders, setFolders] = useState(data.folders)
  const [filter, setFilter] = useState<Filter>('open')
  const [mode, setMode] = useState<WorkbenchMode>(() => defaultMode(data.votes, data.votedFolders))
  const [view, setView] = useState<'loupe' | 'grid'>('loupe')
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const shellRef = useRef<HTMLDivElement>(null)

  const refMap = useMemo(() => new Map(data.references.map((r) => [r.icgId, r])), [data.references])
  const visible = useMemo(() => sessionFolders(folders, filter), [folders, filter])
  const progress = useMemo(() => sessionProgress(folders), [folders])
  const current = visible[Math.min(index, Math.max(0, visible.length - 1))] as WorkbenchFolder | undefined

  /** The person pinned in person-led mode — the group's dominant candidate. */
  const pinned = useMemo(() => {
    const top = dominantCandidate(data.votes, data.votedFolders)
    return top ? { icgId: top.icgId, name: top.name, fromFolder: true } : null
  }, [data.votes, data.votedFolders])

  const candidates = useMemo(
    () => (current ? candidatesForFolder(current.suggestions, data.votes, current.rejectedIcgIds) : []),
    [current, data.votes],
  )

  // In person-led mode the subject is the pin, not whatever this folder suggests:
  // the whole point is that the question does not change between folders.
  const subject: FolderCandidate | null = mode === 'person' ? pinned : (candidates[0] ?? null)

  const nameOf = useMemo(() => {
    const m: Record<string, string> = {}
    for (const v of data.votes) m[v.icgId] = v.name
    for (const f of folders) for (const s of f.suggestions) m[s.icgId] ??= s.name
    return m
  }, [data.votes, folders])

  // Preload around the cursor. The stutter on a keystroke is what makes a
  // keyboard flow feel slow, and a 36 KB JPEG over the LAN costs nothing.
  useEffect(() => {
    for (const f of preloadWindow(visible, index)) {
      if (!f.coverUrl) continue
      const img = new Image()
      img.src = f.coverUrl
    }
  }, [visible, index])

  useEffect(() => {
    shellRef.current?.focus()
  }, [])

  const applyLocal = useCallback((folderId: string, patch: Partial<WorkbenchFolder>) => {
    setFolders((fs) => fs.map((f) => (f.id === folderId ? { ...f, ...patch } : f)))
  }, [])

  const advanceAfterDecision = useCallback(() => {
    // The answered folder leaves the open pass, so the next one has taken this
    // index. Stepping to index+1 would skip a folder on every single decision.
    setIndex((i) => nextIndexAfterDecision(i, Math.max(0, visible.length - 1)))
  }, [visible.length])

  const run = useCallback(
    async (fn: () => Promise<{ success: boolean; error?: string }>, after?: () => void) => {
      setBusy(true)
      const res = await fn()
      setBusy(false)
      if (!res.success) {
        setFlash(res.error ?? 'Action failed')
        return
      }
      setFlash(null)
      after?.()
      router.refresh()
    },
    [router],
  )

  const confirmWith = useCallback(
    (icgIds: string[], names: Record<string, string>, keepFocus = false) => {
      if (!current || icgIds.length === 0) return
      const folderId = current.id
      void run(
        () => confirmFolderAction(folderId, icgIds, names),
        () => {
          applyLocal(folderId, {
            identity: 'CONFIRMED',
            attributions: icgIds.map((id) => ({ icgId: id, name: names[id] ?? id })),
          })
          if (!keepFocus) advanceAfterDecision()
        },
      )
    },
    [current, run, applyLocal, advanceAfterDecision],
  )

  const rejectTop = useCallback(() => {
    if (!current) return
    // In person-led mode "no" is about the pinned person; in folder-led it is
    // about the top candidate. Either way it dismisses ONE candidate, and the
    // folder only closes when nothing is left to offer.
    const target = mode === 'person' ? pinned : candidates[0]
    if (!target) return
    const folderId = current.id
    const remaining = mode === 'person' ? 1 : candidates.length
    void run(
      () => rejectCandidateAction(folderId, target.icgId, remaining),
      () => {
        const rejected = [...new Set([...current.rejectedIcgIds, target.icgId])]
        const left = candidatesForFolder(current.suggestions, data.votes, rejected)
        applyLocal(folderId, {
          rejectedIcgIds: rejected,
          identity: left.length === 0 || mode === 'person' ? 'REJECTED' : current.identity,
        })
        if (left.length === 0 || mode === 'person') advanceAfterDecision()
      },
    )
  }, [current, mode, pinned, candidates, data.votes, run, applyLocal, advanceAfterDecision])

  const skip = useCallback(() => {
    if (!current) return
    const folderId = current.id
    void run(
      () => skipFolderAction(folderId),
      () => {
        applyLocal(folderId, { identity: 'SKIPPED' })
        advanceAfterDecision()
      },
    )
  }, [current, run, applyLocal, advanceAfterDecision])

  const undo = useCallback(() => {
    if (!current) return
    const folderId = current.id
    void run(
      () => undoFolderAction(folderId),
      () => applyLocal(folderId, { identity: 'OPEN', attributions: [], rejectedIcgIds: [] }),
    )
  }, [current, run, applyLocal])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || pickerOpen) return

      const digit = /^Digit([1-9])$/.exec(e.code)
      if (digit) {
        const c = candidates[Number(digit[1]) - 1]
        if (c) {
          e.preventDefault()
          // Shift adds a person and holds the folder — a set with several
          // participants is built up one key at a time. Confirming is additive.
          confirmWith([c.icgId], { [c.icgId]: c.name }, e.shiftKey)
        }
        return
      }

      switch (e.key.toLowerCase()) {
        case 'arrowright':
        case 'l':
          e.preventDefault()
          setIndex((i) => Math.min(visible.length - 1, i + 1))
          break
        case 'arrowleft':
        case 'h':
          e.preventDefault()
          setIndex((i) => Math.max(0, i - 1))
          break
        case 'j':
          e.preventDefault()
          if (mode === 'person' && pinned) confirmWith([pinned.icgId], { [pinned.icgId]: pinned.name })
          break
        case 'a': {
          e.preventDefault()
          const own = [...new Set(current?.suggestions.map((s) => s.icgId) ?? [])]
          if (own.length > 0) confirmWith(own, nameOf)
          break
        }
        case 'n':
        case 'x':
          e.preventDefault()
          rejectTop()
          break
        case ' ':
          e.preventDefault()
          skip()
          break
        case 'u':
          e.preventDefault()
          undo()
          break
        case 'm':
          e.preventDefault()
          setMode((m) => (m === 'person' ? 'folder' : 'person'))
          break
        case 'g':
          e.preventDefault()
          setView((v) => (v === 'grid' ? 'loupe' : 'grid'))
          break
        case '/':
          e.preventDefault()
          setPickerOpen(true)
          break
        case 'escape':
          e.preventDefault()
          router.push(queueHref)
          break
      }
    },
    [pickerOpen, candidates, visible.length, mode, pinned, current, nameOf, confirmWith, rejectTop, skip, undo, router, queueHref],
  )

  const groupLabel = `${data.channelShortName ?? '?'} · alias "${data.aliasToken ?? '—'}"`

  return (
    <div
      ref={shellRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex h-[calc(100vh-4rem)] flex-col outline-none"
    >
      {/* Header: where you are, how far, and the way out. */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 text-sm">
        <Link href={queueHref} className="text-muted-foreground hover:text-foreground">
          ← queue
        </Link>
        <span className="font-medium">{groupLabel}</span>
        <span className="tabular-nums text-muted-foreground">
          {progress.decided} / {progress.total} decided
        </span>
        <div className="h-1 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${progress.total ? (progress.decided / progress.total) * 100 : 0}%` }}
          />
        </div>

        <div className="flex gap-1" role="tablist" aria-label="Which folders to show">
          {(['open', 'all', 'decided'] as const).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => {
                setFilter(f)
                setIndex(0)
              }}
              className={cn(
                'rounded px-2 py-0.5 text-xs transition-colors duration-150',
                filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <button
          onClick={() => setMode((m) => (m === 'person' ? 'folder' : 'person'))}
          className="rounded border border-border/60 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          title="Switch between asking about a person and asking about a folder (M)"
        >
          {mode === 'person' ? 'person-led' : 'folder-led'} · M
        </button>
        <button
          onClick={() => setView((v) => (v === 'grid' ? 'loupe' : 'grid'))}
          className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          title="Grid compares folders against each other (G)"
        >
          {view === 'grid' ? <Rows3 className="h-3 w-3" /> : <Grid2x2 className="h-3 w-3" />}
          {view === 'grid' ? 'loupe' : 'grid'} · G
        </button>

        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {flash && <span className="text-xs text-destructive">{flash}</span>}
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 p-4">
          {progress.finished ? (
            <FinishedPanel
              nextHref={
                data.nextGroupKey
                  ? `/archive/workbench?group=${encodeURIComponent(data.nextGroupKey)}&from=${from}`
                  : null
              }
              queueHref={queueHref}
            />
          ) : view === 'grid' ? (
            <GridView folders={visible} currentId={current?.id ?? null} onJump={(id) => setIndex(visible.findIndex((f) => f.id === id))} />
          ) : current ? (
            <LoupeView folder={current} />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing in this view.</p>
          )}
        </main>

        <WorkbenchInspector
          mode={mode}
          subject={subject}
          reference={subject ? refMap.get(subject.icgId) : undefined}
          candidates={candidates}
          references={refMap}
          decided={!!current && current.identity !== 'OPEN'}
          busy={busy}
          onYes={() => pinned && confirmWith([pinned.icgId], { [pinned.icgId]: pinned.name })}
          onNo={rejectTop}
          onPick={(c) => confirmWith([c.icgId], { [c.icgId]: c.name })}
          onAddPick={(c) => confirmWith([c.icgId], { [c.icgId]: c.name }, true)}
          onSkip={skip}
          onUndo={undo}
          onSearch={() => setPickerOpen(true)}
        />
      </div>

      <WorkbenchFilmstrip
        items={visible.map((f) => ({ id: f.id, coverUrl: f.coverUrl, identity: f.identity }))}
        currentId={current?.id ?? null}
        onJump={(id) => setIndex(visible.findIndex((f) => f.id === id))}
      />

      <PersonAssignPicker
        open={pickerOpen}
        targetLabel={current?.folderName ?? 'this folder'}
        onAssign={(p: AssignablePerson) => {
          setPickerOpen(false)
          confirmWith([p.icgId], { [p.icgId]: p.name })
          shellRef.current?.focus()
        }}
        onClose={() => {
          setPickerOpen(false)
          shellRef.current?.focus()
        }}
      />
    </div>
  )
}

/** The cover, as large as the screen allows and never cropped. */
function LoupeView({ folder }: { folder: WorkbenchFolder }) {
  const Icon = folder.isVideo ? Film : Camera
  return (
    <>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {folder.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- MinIO URL
          <img src={folder.coverUrl} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="flex h-64 w-48 items-center justify-center rounded bg-muted text-muted-foreground">
            <Icon className="h-8 w-8" />
          </span>
        )}
      </div>
      <div className="w-full max-w-2xl shrink-0 space-y-0.5 text-center">
        <p className="truncate text-sm" title={folder.fullPath}>
          {folder.folderName}
        </p>
        {folder.attributions.length > 0 ? (
          <p className="flex justify-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
            {folder.attributions.map((a) => (
              <PersonIdentity key={a.icgId} name={a.name} icgId={a.icgId} />
            ))}
          </p>
        ) : folder.matcherSuggestion ? (
          <p
            className={cn(
              'truncate text-xs',
              folder.matcherSuggestion.agrees.date || folder.matcherSuggestion.agrees.title
                ? 'text-muted-foreground'
                : 'text-amber-600 dark:text-amber-400',
            )}
          >
            matcher: {folder.matcherSuggestion.title}
            {folder.matcherSuggestion.releaseDate && ` · ${folder.matcherSuggestion.releaseDate}`}
          </p>
        ) : null}
      </div>
    </>
  )
}

/** The contact sheet — for when the question is "are these the same person?". */
function GridView({
  folders,
  currentId,
  onJump,
}: {
  folders: WorkbenchFolder[]
  currentId: string | null
  onJump: (id: string) => void
}) {
  return (
    <ul className="grid max-h-full w-full grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4 xl:grid-cols-6">
      {folders.map((f) => (
        <li key={f.id}>
          <button
            onClick={() => onJump(f.id)}
            className={cn(
              'w-full overflow-hidden rounded border bg-background/60 text-left transition-shadow duration-150',
              f.id === currentId ? 'border-primary ring-2 ring-primary' : 'border-border/60',
            )}
          >
            <div className="aspect-[3/4] overflow-hidden bg-muted/60">
              {f.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- MinIO URL
                <img src={f.coverUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
              ) : null}
            </div>
            <p className="truncate p-1 text-[10px]" title={f.folderName}>
              {f.folderName}
            </p>
          </button>
        </li>
      ))}
    </ul>
  )
}

function FinishedPanel({ nextHref, queueHref }: { nextHref: string | null; queueHref: string }) {
  return (
    <div className="space-y-3 text-center">
      <p className="text-sm font-medium">Every folder in this group is answered.</p>
      {nextHref ? (
        <Link
          href={nextHref}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Next group with work <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">No other group has open folders.</p>
      )}
      <p>
        <Link href={queueHref} className="text-xs text-muted-foreground underline underline-offset-2">
          back to the queue
        </Link>
      </p>
    </div>
  )
}
