'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Grid2x2, Loader2, Rows3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { candidatesForFolder, type FolderCandidate } from '@/lib/attribution-candidates'
import {
  defaultMode,
  dominantCandidate,
  nextIndexAfterDecision,
  nextOverlayLevel,
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
  checkCastAgreementAction,
  removeFolderAttributionAction,
} from '@/lib/actions/attribution-actions'
import { PersonAssignPicker, type AssignablePerson } from '@/components/archive/person-assign-picker'
import { WorkbenchFilmstrip } from './workbench-filmstrip'
import { LoupeView } from './workbench-loupe'
import { useViewPrefs } from './use-view-prefs'
import { WorkbenchInspector, type PersonReference } from './workbench-inspector'

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
  /** `null` = a single-folder session opened from the archive list, not a group. */
  key: string | null
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
export function WorkbenchClient({
  data,
  from = 'open',
  back,
}: {
  data: WorkbenchData
  from?: string
  /** The list this session was opened from, restored exactly on the way out. */
  back?: string
}) {
  // A session about one folder has no group behind it: no votes to pin a person
  // on, no progress worth a bar, no next group. It came from the archive list and
  // that is where leaving returns to, with the row marked.
  const singleFolder = data.key === null
  /** The view the operator came from, so leaving returns them to it. */
  const queueHref = singleFolder
    ? (back ?? `/archive?highlight=${data.folders[0]?.id ?? ''}`)
    : from === 'open'
      ? '/archive/attribution'
      : `/archive/attribution?view=${from}`
  const router = useRouter()
  const [folders, setFolders] = useState(data.folders)
  const [filter, setFilter] = useState<Filter>(data.key === null ? 'all' : 'open')
  const [mode, setMode] = useState<WorkbenchMode>(() =>
    // Person-led needs a candidate carrying ≥60 % of a group; one folder is
    // always 100 % of itself, which would make the question meaningless.
    data.key === null ? 'folder' : defaultMode(data.votes, data.votedFolders),
  )
  const [view, setView] = useState<'loupe' | 'grid'>('loupe')
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [prefs, updatePrefs] = useViewPrefs()
  const shellRef = useRef<HTMLDivElement>(null)

  const refMap = useMemo(() => new Map(data.references.map((r) => [r.icgId, r])), [data.references])
  const visible = useMemo(() => sessionFolders(folders, filter), [folders, filter])
  const progress = useMemo(() => sessionProgress(folders), [folders])

  /**
   * The folder being built up, held under the cursor by id.
   *
   * Confirming marks a folder CONFIRMED, and the open pass drops it the moment it
   * is — so "add a person and stay here" moved the cursor onto the *next* folder
   * and attributed everyone after the first to that one. Nothing on screen said
   * so. While a folder is sticky it stays current no matter what the filter says;
   * finishing it (or moving by hand) releases it.
   */
  const [sticky, setSticky] = useState<string | null>(null)
  const stickyFolder = useMemo(
    () => (sticky ? (folders.find((f) => f.id === sticky) ?? null) : null),
    [sticky, folders],
  )
  const current = (stickyFolder ??
    visible[Math.min(index, Math.max(0, visible.length - 1))]) as WorkbenchFolder | undefined

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

  /**
   * Ask before writing a claim the linked set does not know.
   *
   * ADR-0028 keeps claims and casts apart, and a disagreement is a decision, not
   * an error — so this asks rather than blocks, and the contradiction session
   * picks up whatever you confirm. Only a folder with a confirmed link can
   * disagree with anything; for an orphan the check returns nothing and no
   * dialog appears.
   */
  const castObjection = useCallback(
    async (folderId: string, icgIds: string[], names: Record<string, string>): Promise<boolean> => {
      const res = await checkCastAgreementAction(folderId, icgIds)
      if (!res.success || !res.data || res.data.missing.length === 0) return true
      const who = res.data.missing.map((id) => `${names[id] ?? id} (${id})`).join(', ')
      const setName = res.data.setTitle ? `"${res.data.setTitle}"` : 'the linked set'
      return window.confirm(
        `${setName} does not credit ${who}.\n\n` +
          'Recording it anyway leaves a contradiction to settle in Archive → Conflicts. Continue?',
      )
    },
    [],
  )

  const doConfirm = useCallback(
    (folderId: string, icgIds: string[], names: Record<string, string>, keepFocus: boolean) => {
      void run(
        () => confirmFolderAction(folderId, icgIds, names),
        () => {
          // Merge, do not replace: the write is additive (an upsert per person,
          // nothing removed), so a screen that shows only the last one added
          // says the second person replaced the first. Building a cast with
          // Shift+digit then looked broken while the database was right.
          const added = icgIds.map((id) => ({ icgId: id, name: names[id] ?? id }))
          setFolders((fs) =>
            fs.map((f) => {
              if (f.id !== folderId) return f
              const seen = new Set(f.attributions.map((a) => a.icgId))
              return {
                ...f,
                identity: 'CONFIRMED' as const,
                attributions: [...f.attributions, ...added.filter((a) => !seen.has(a.icgId))],
              }
            }),
          )
          if (keepFocus) setSticky(folderId)
          else {
            setSticky(null)
            advanceAfterDecision()
          }
        },
      )
    },
    [run, advanceAfterDecision],
  )

  const confirmWith = useCallback(
    (icgIds: string[], names: Record<string, string>, keepFocus = false) => {
      if (!current || icgIds.length === 0) return
      const folderId = current.id
      void (async () => {
        if (!(await castObjection(folderId, icgIds, names))) return
        doConfirm(folderId, icgIds, names, keepFocus)
      })()
    },
    [current, castObjection, doConfirm],
  )

  /** Take one person off this folder; the last one leaves it unanswered again. */
  const removePerson = useCallback(
    (icgId: string) => {
      if (!current) return
      const folderId = current.id
      void run(
        () => removeFolderAttributionAction(folderId, icgId),
        () => {
          setFolders((fs) =>
            fs.map((f) => {
              if (f.id !== folderId) return f
              const attributions = f.attributions.filter((a) => a.icgId !== icgId)
              return {
                ...f,
                attributions,
                identity: attributions.length === 0 ? ('OPEN' as const) : f.identity,
              }
            }),
          )
        },
      )
    },
    [current, run],
  )

  /**
   * Done with this folder. The write already happened; this only decides where
   * you end up.
   *
   * In a group session that is the next folder. In a single-folder session there
   * is no next folder, so "done" means leaving — without this, Enter and the
   * button both did nothing visible, which reads as broken.
   */
  const finishFolder = useCallback(() => {
    if (singleFolder) {
      router.push(queueHref)
      return
    }
    if (!sticky) return
    setSticky(null)
    advanceAfterDecision()
  }, [singleFolder, router, queueHref, sticky, advanceAfterDecision])

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
          // Collect mode is that Shift latched: every key adds, `Enter` finishes.
          confirmWith([c.icgId], { [c.icgId]: c.name }, e.shiftKey || prefs.collect)
        }
        return
      }

      switch (e.key.toLowerCase()) {
        case 'arrowright':
        case 'l':
          e.preventDefault()
          // Moving by hand releases the folder being built up — the cursor is
          // yours again.
          setSticky(null)
          setIndex((i) => Math.min(visible.length - 1, i + 1))
          break
        case 'arrowleft':
        case 'h':
          e.preventDefault()
          setSticky(null)
          setIndex((i) => Math.max(0, i - 1))
          break
        case 'enter':
          e.preventDefault()
          finishFolder()
          break
        case 'c':
          e.preventDefault()
          updatePrefs({ collect: !prefs.collect })
          break
        case 'j':
          e.preventDefault()
          if (mode === 'person' && pinned) {
            confirmWith([pinned.icgId], { [pinned.icgId]: pinned.name }, prefs.collect)
          }
          break
        case 'a': {
          e.preventDefault()
          const own = [...new Set(current?.suggestions.map((s) => s.icgId) ?? [])]
          if (own.length > 0) confirmWith(own, nameOf, prefs.collect)
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
        case 'i':
          // Lightroom's key for exactly this job: how much the overlay says.
          e.preventDefault()
          updatePrefs({ overlay: nextOverlayLevel(prefs.overlay) })
          break
        case 't':
          // Nothing below the image at all, for a fast pass.
          e.preventDefault()
          updatePrefs({ filmstrip: !prefs.filmstrip })
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
    [
      pickerOpen,
      candidates,
      visible.length,
      mode,
      pinned,
      current,
      nameOf,
      confirmWith,
      rejectTop,
      skip,
      undo,
      router,
      queueHref,
      prefs.overlay,
      prefs.filmstrip,
      prefs.collect,
      finishFolder,
      updatePrefs,
    ],
  )

  const groupLabel = singleFolder
    ? (data.folders[0]?.folderName ?? 'One folder')
    : `${data.channelShortName ?? '?'} · alias "${data.aliasToken ?? '—'}"`

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
          {singleFolder ? '← archive' : '← queue'}
        </Link>
        <span className="font-medium">{groupLabel}</span>
        {/* Progress over a single folder is 0/1 then 1/1 — noise, not information. */}
        {!singleFolder && (
          <>
            <span className="tabular-nums text-muted-foreground">
              {progress.decided} / {progress.total} decided
            </span>
            <div className="h-1 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{ width: `${progress.total ? (progress.decided / progress.total) * 100 : 0}%` }}
              />
            </div>
          </>
        )}

        {/* Nothing to filter when the session is one folder. */}
        {!singleFolder && (
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
        )}

        {!singleFolder && (
          <button
            onClick={() => setMode((m) => (m === 'person' ? 'folder' : 'person'))}
            className="rounded border border-border/60 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            title="Switch between asking about a person and asking about a folder (M)"
          >
            {mode === 'person' ? 'person-led' : 'folder-led'} · M
          </button>
        )}

        {/* The mode that changes what every other key does — stated, not hidden
            in a preference. */}
        <button
          onClick={() => updatePrefs({ collect: !prefs.collect })}
          aria-pressed={prefs.collect}
          className={cn(
            'rounded border px-2 py-0.5 text-xs transition-colors',
            prefs.collect
              ? 'border-amber-500/60 bg-amber-500/15 font-medium text-amber-700 dark:text-amber-400'
              : 'border-border/60 text-muted-foreground hover:text-foreground',
          )}
          title="Collect several people per folder; Enter finishes the folder (C)"
        >
          {prefs.collect ? 'multiple people · C' : 'single person · C'}
        </button>
        <button
          onClick={() => updatePrefs({ overlay: nextOverlayLevel(prefs.overlay) })}
          className="rounded border border-border/60 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          title="How much the overlay on the cover says (I)"
        >
          info: {prefs.overlay} · I
        </button>
        {!singleFolder && (
          <button
            onClick={() => updatePrefs({ filmstrip: !prefs.filmstrip })}
            className="rounded border border-border/60 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            title="Show or hide the filmstrip (T)"
          >
            strip: {prefs.filmstrip ? 'on' : 'off'} · T
          </button>
        )}
        <button
          onClick={() => setView((v) => (v === 'grid' ? 'loupe' : 'grid'))}
          hidden={singleFolder}
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
        <main className="flex min-w-0 flex-1 flex-col items-center justify-center p-4">
          {progress.finished && !singleFolder ? (
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
            <LoupeView
              folder={current}
              overlay={prefs.overlay}
              subject={subject}
              reference={subject ? refMap.get(subject.icgId) : undefined}
              collecting={prefs.collect || sticky === current.id}
            />
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
          attributions={current?.attributions ?? []}
          // A single-folder session always offers the way out once somebody is
          // recorded; a group session only while a folder is being built up.
          showFinish={
            (current?.attributions.length ?? 0) > 0 &&
            (singleFolder || prefs.collect || sticky === current?.id)
          }
          finishLabel={singleFolder ? 'Done — back to the archive · Enter' : 'Done with this folder · Enter'}
          onRemove={removePerson}
          onFinish={finishFolder}
          decided={!!current && current.identity !== 'OPEN'}
          busy={busy}
          onYes={() => pinned && confirmWith([pinned.icgId], { [pinned.icgId]: pinned.name }, prefs.collect)}
          onNo={rejectTop}
          onPick={(c) => confirmWith([c.icgId], { [c.icgId]: c.name }, prefs.collect)}
          onAddPick={(c) => confirmWith([c.icgId], { [c.icgId]: c.name }, true)}
          onSkip={skip}
          onUndo={undo}
          onSearch={() => setPickerOpen(true)}
        />
      </div>

      {prefs.filmstrip && !singleFolder && (
        <WorkbenchFilmstrip
          items={visible.map((f) => ({ id: f.id, coverUrl: f.coverUrl, identity: f.identity }))}
          currentId={current?.id ?? null}
          onJump={(id) => setIndex(visible.findIndex((f) => f.id === id))}
        />
      )}

      <PersonAssignPicker
        open={pickerOpen}
        targetLabel={current?.folderName ?? 'this folder'}
        onAssign={(p: AssignablePerson, { keepOpen }) => {
          // Shift keeps the picker up and the folder open, so a set with several
          // people none of whom were proposed can be entered in one go.
          if (!keepOpen) setPickerOpen(false)
          confirmWith([p.icgId], { [p.icgId]: p.name }, keepOpen)
          if (!keepOpen) shellRef.current?.focus()
        }}
        onClose={() => {
          setPickerOpen(false)
          shellRef.current?.focus()
        }}
      />
    </div>
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
