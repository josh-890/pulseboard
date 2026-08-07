'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, Check, Loader2, Unlink, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { nextIndexAfterDecision, nextOverlayLevel, preloadWindow } from '@/lib/workbench-session'
import { resolveConflictAction } from '@/lib/actions/attribution-actions'
import type { ConflictAnswer, ConflictFolder } from '@/lib/services/conflict-session-service'
import type { PersonReference } from '@/lib/services/person-reference-service'
import { PersonIdentity } from '@/components/shared/person-identity'
import { WorkbenchFilmstrip } from './workbench-filmstrip'
import { useViewPrefs } from './use-view-prefs'
import { LoupeView } from './workbench-loupe'

export type ConflictSessionData = {
  folders: ConflictFolder[]
  references: PersonReference[]
}

/**
 * Deciding a contradiction: your claim on the left of the cover, the set's cast
 * on the right, and the cover between them.
 *
 * The same shell as the attribution workbench, because it is the same physical
 * act — look, judge, one key, next — but a different question. There is no
 * person-led mode and no candidate list here: the two answers are already known,
 * and what is missing is only which of them is the person in the picture.
 *
 * `2` is a link rather than a key when the folder hangs off a promoted Set: its
 * cast is a cache rebuilt from `SessionContribution`, so adding someone is a
 * credit on a session, not a keystroke. Pretending otherwise would write into a
 * cache that the next rebuild wipes (ADR-0028).
 */
export function ConflictSessionClient({ data }: { data: ConflictSessionData }) {
  const router = useRouter()
  const [rows, setRows] = useState(data.folders)
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [prefs, updatePrefs] = useViewPrefs()
  const shellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    shellRef.current?.focus()
  }, [])

  const refMap = useMemo(() => new Map(data.references.map((r) => [r.icgId, r])), [data.references])
  const current = rows[Math.min(index, Math.max(0, rows.length - 1))] as ConflictFolder | undefined

  useEffect(() => {
    for (const r of preloadWindow(rows, index)) {
      if (!r.coverUrl) continue
      const img = new Image()
      img.src = r.coverUrl
    }
  }, [rows, index])

  const answer = useCallback(
    (a: ConflictAnswer) => {
      if (!current || busy) return
      const { folderId, claim, id } = current
      setBusy(true)
      void (async () => {
        const res = await resolveConflictAction(folderId, claim.icgId, a)
        setBusy(false)
        if (!res.success) {
          setFlash(res.error ?? 'Could not record that')
          return
        }
        if (res.data && !res.data.resolved) {
          // The only way here is a promoted Set, whose cast this session may not
          // write. Say so rather than pretending the answer landed.
          setFlash('That set is already promoted — credit the person on the set itself.')
          return
        }
        setFlash(null)
        setRows((rs) => {
          const left = rs.filter((r) => r.id !== id)
          setIndex((i) => nextIndexAfterDecision(i, left.length))
          return left
        })
        router.refresh()
      })()
    },
    [current, busy, router],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const digit = /^Digit([1-3])$/.exec(e.code)
      if (digit && current) {
        e.preventDefault()
        if (digit[1] === '1') answer('import-right')
        // A promoted Set is a hand-off, not an answer — the button is a link and
        // the key deliberately does nothing.
        else if (digit[1] === '2' && current.target.kind === 'staging') answer('claim-right')
        else if (digit[1] === '3') answer('wrong-link')
        return
      }
      switch (e.key.toLowerCase()) {
        case 'arrowright':
        case 'l':
          e.preventDefault()
          setIndex((i) => Math.min(rows.length - 1, i + 1))
          break
        case 'arrowleft':
        case 'h':
          e.preventDefault()
          setIndex((i) => Math.max(0, i - 1))
          break
        case ' ':
          e.preventDefault()
          setIndex((i) => Math.min(rows.length - 1, i + 1))
          break
        case 'i':
          e.preventDefault()
          updatePrefs({ overlay: nextOverlayLevel(prefs.overlay) })
          break
        case 't':
          e.preventDefault()
          updatePrefs({ filmstrip: !prefs.filmstrip })
          break
        case 'escape':
          e.preventDefault()
          router.push('/archive/attribution')
          break
      }
    },
    [current, rows.length, answer, prefs.overlay, prefs.filmstrip, updatePrefs, router],
  )

  return (
    <div ref={shellRef} tabIndex={0} onKeyDown={onKeyDown} className="flex h-[calc(100vh-4rem)] flex-col outline-none">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 text-sm">
        <Link href="/archive/attribution" className="text-muted-foreground hover:text-foreground">
          ← attribution queue
        </Link>
        <span className="font-medium">Contradictions</span>
        <span className="tabular-nums text-muted-foreground">{rows.length} open</span>
        <button
          onClick={() => updatePrefs({ overlay: nextOverlayLevel(prefs.overlay) })}
          className="ml-auto rounded border border-border/60 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          title="How much the overlay on the cover says (I)"
        >
          info: {prefs.overlay} · I
        </button>
        <button
          onClick={() => updatePrefs({ filmstrip: !prefs.filmstrip })}
          className="rounded border border-border/60 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          title="Show or hide the filmstrip (T)"
        >
          strip: {prefs.filmstrip ? 'on' : 'off'} · T
        </button>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {flash && <span className="text-xs text-amber-600 dark:text-amber-400">{flash}</span>}
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col items-center justify-center p-4">
          {current ? (
            <LoupeView
              folder={{
                folderName: current.folderName,
                fullPath: current.fullPath,
                coverUrl: current.coverUrl,
                isVideo: current.isVideo,
                attributions: [],
                matcherSuggestion: null,
              }}
              overlay={prefs.overlay}
              subject={current.claim}
              reference={refMap.get(current.claim.icgId)}
            />
          ) : (
            <div className="space-y-3 text-center">
              <p className="text-sm font-medium">Nothing contradicts itself right now.</p>
              <Link href="/archive/attribution" className="text-xs text-muted-foreground underline underline-offset-2">
                back to the attribution queue
              </Link>
            </div>
          )}
        </main>

        {current && (
          <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border/60 bg-card/40 p-3">
            <section>
              <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground">You claimed</h2>
              <Face person={current.claim} reference={refMap.get(current.claim.icgId)} size="lg" />
            </section>

            <section className="min-w-0">
              <h2 className="text-[10px] uppercase tracking-wide text-muted-foreground">
                The {current.target.kind === 'set' ? 'set' : 'staging set'} credits
              </h2>
              <p className="mb-1 truncate text-xs text-muted-foreground" title={current.target.title}>
                {current.target.title}
              </p>
              <ul className="space-y-1">
                {current.target.cast.map((p) => (
                  <li key={`${p.icgId}-${p.name}`}>
                    <Face person={p} reference={refMap.get(p.icgId)} size="sm" />
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-1.5 border-t border-border/60 pt-3">
              <Answer
                onClick={() => answer('import-right')}
                busy={busy}
                icon={X}
                hint="1"
                label="The set is right"
                sub="Drop my claim — and never propose them for this folder again"
              />
              {current.target.kind === 'staging' ? (
                <Answer
                  onClick={() => answer('claim-right')}
                  busy={busy}
                  icon={Check}
                  hint="2"
                  tone="primary"
                  label="I am right"
                  sub="The credits were incomplete — add them to this set"
                />
              ) : (
                <Link
                  href={`/sets/${current.target.id}`}
                  className="flex w-full items-start gap-2 rounded-md bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 text-left">
                    <span className="block font-medium">I am right — open the set</span>
                    <span className="block opacity-80">
                      A promoted set is credited through its session, not from here
                    </span>
                  </span>
                </Link>
              )}
              <Answer
                onClick={() => answer('wrong-link')}
                busy={busy}
                icon={Unlink}
                hint="3"
                label="Wrong link"
                sub="This folder is not that set — unlink it, my claim stays"
              />
            </section>

            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Neither side is automatically right: a credit list can be incomplete, and your claim
              was made with this cover in front of you. Nothing here is decided for you — but there
              is no “leave it”, because the list is computed from the data itself.
            </p>
          </aside>
        )}
      </div>

      {prefs.filmstrip && (
        <WorkbenchFilmstrip
          items={rows.map((r) => ({ id: r.id, coverUrl: r.coverUrl, identity: 'OPEN' as const }))}
          currentId={current?.id ?? null}
          onJump={(id) => setIndex(rows.findIndex((r) => r.id === id))}
        />
      )}
    </div>
  )
}

function Face({
  person,
  reference,
  size,
}: {
  person: { icgId: string; name: string }
  reference: PersonReference | undefined
  size: 'sm' | 'lg'
}) {
  const box = size === 'lg' ? 'h-[120px] w-20' : 'h-14 w-10'
  return (
    <div className="flex items-start gap-2">
      {reference?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- MinIO URL
        <img src={reference.avatarUrl} alt="" className={cn(box, 'shrink-0 rounded object-cover')} />
      ) : (
        <span
          className={cn(
            box,
            'flex shrink-0 items-center justify-center rounded bg-muted text-center text-[10px] text-muted-foreground',
          )}
        >
          no face
        </span>
      )}
      <PersonIdentity name={person.name} icgId={person.icgId} className="min-w-0 pt-0.5 text-xs" />
    </div>
  )
}

function Answer({
  onClick,
  busy,
  icon: Icon,
  label,
  sub,
  hint,
  tone = 'default',
}: {
  onClick: () => void
  busy: boolean
  icon: typeof Check
  label: string
  sub: string
  hint: string
  tone?: 'primary' | 'default'
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={cn(
        'flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-xs transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-40',
        tone === 'primary'
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 text-left">
        <span className="block font-medium">{label}</span>
        <span className="block opacity-80">{sub}</span>
      </span>
      <kbd className="shrink-0 rounded border border-border bg-background px-1 font-mono text-[10px] leading-4 text-foreground">
        {hint}
      </kbd>
    </button>
  )
}
