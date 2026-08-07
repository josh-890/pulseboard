'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, Loader2, Undo2, UserX, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AttributionQueue, AttributionQueueGroup } from '@/lib/services/attribution-confirm-service'
import {
  markGroupNotAPersonAction,
  skipGroupAction,
  undoAttributionGroupAction,
} from '@/lib/actions/attribution-actions'
import { PersonIdentity } from '@/components/shared/person-identity'

type AttributionQueueClientProps = {
  initialQueue: AttributionQueue
  view: 'open' | 'conflicted' | 'decided'
  /** Folders whose attribution the set they are linked to contradicts (ADR-0028). */
  conflicts: number
}

const VIEWS = [
  { id: 'open', label: 'Open' },
  { id: 'conflicted', label: 'Needs a decision' },
  { id: 'decided', label: 'Decided' },
] as const

/**
 * Triage for archive attribution (ADR-0027) — and *only* triage.
 *
 * This page answers one question: what do I work on next. Groups are ordered by
 * leverage (folder count), because that is what makes ~8.9k groups finite — the
 * top 1,000 cover 14,090 folders. Opening one hands it to `/archive/workbench`,
 * which answers the different question of who is in each set and needs the whole
 * screen to do it. The decision surface used to live here, inside a list, and the
 * important task got whatever space the list left over.
 *
 * What stays are the two verdicts that really are about a whole group: "not a
 * person" (`W4B | w4b magazine` is a magazine title across 204 folders) and skip.
 */
export function AttributionQueueClient({ initialQueue, view, conflicts }: AttributionQueueClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // The list is DERIVED from props, never seeded into state. Switching views is a
  // client-side navigation: the component instance survives, so a `useState`
  // seeded from props would keep showing the previous view's groups while the
  // counters — read straight from props — updated. `dismissed` only hides what
  // this session just decided, so the row disappears immediately instead of
  // waiting for router.refresh() to land.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())
  const groups = initialQueue.groups.filter((g) => !dismissed.has(g.key))
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ key: string; text: string; tone: 'ok' | 'err' } | null>(null)
  const [, startTransition] = useTransition()

  const counts = initialQueue.counts

  const setView = (next: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'open') params.delete('view')
    else params.set('view', next)
    startTransition(() => router.push(`/archive/attribution?${params.toString()}`))
  }

  const afterDecision = (key: string, text: string) => {
    setFlash({ key, text, tone: 'ok' })
    setDismissed((d) => new Set(d).add(key))
    startTransition(() => router.refresh())
  }

  const notAPerson = async (g: AttributionQueueGroup) => {
    setBusy(g.key)
    const res = await markGroupNotAPersonAction(g.key)
    setBusy(null)
    if (res.success) afterDecision(g.key, `Ruled out — ${res.data.folderCount} folder(s) stay unattributed`)
    else setFlash({ key: g.key, text: res.error, tone: 'err' })
  }

  const skip = async (g: AttributionQueueGroup) => {
    setBusy(g.key)
    const res = await skipGroupAction(g.key)
    setBusy(null)
    if (res.success) afterDecision(g.key, 'Skipped')
    else setFlash({ key: g.key, text: res.error, tone: 'err' })
  }

  const undo = async (g: AttributionQueueGroup) => {
    setBusy(g.key)
    const res = await undoAttributionGroupAction(g.key)
    setBusy(null)
    if (res.success) afterDecision(g.key, `Undone — ${res.data.removedAttributions} attribution(s) removed`)
    else setFlash({ key: g.key, text: res.error, tone: 'err' })
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Archive attribution</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Who is in each archive folder, grouped by channel and the name the folder carries.
              Confirming writes the attribution and registers unknown people as contacts — it
              creates no sets.{' '}
              <Link href="/archive" className="underline underline-offset-2 hover:text-foreground">
                Back to the archive
              </Link>{' '}
              ·{' '}
              <Link href="/archive/develop" className="underline underline-offset-2 hover:text-foreground">
                Develop confirmed sets
              </Link>
            </p>
          </div>
        </div>

        {/* A contradiction is rare and easy to miss, and the only surface that
            would otherwise show it is a maintenance page nobody visits by
            reflex. It sits with the counters because this is where the work that
            creates it happens (ADR-0028). */}
        {conflicts > 0 && (
          <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            {conflicts.toLocaleString()} folder{conflicts === 1 ? '' : 's'} attributed to someone the
            set they are linked to does not credit.{' '}
            <Link href="/archive/conflicts" className="underline underline-offset-2">
              Decide them
            </Link>
          </p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
          {[
            { label: 'Open groups', value: counts.open },
            { label: 'Folders left', value: counts.openFolders },
            { label: 'Unanimous', value: counts.unanimous },
            { label: 'Needs a decision', value: counts.conflicted },
            { label: 'No suggestion', value: counts.silent },
            { label: 'Decided', value: counts.decided },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border/60 bg-card/50 px-3 py-2 backdrop-blur">
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{s.value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex flex-wrap gap-1" role="tablist" aria-label="Attribution queue view">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                view === v.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </header>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
          {view === 'decided' ? 'Nothing decided yet.' : 'Nothing left in this view.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => {
            const isBusy = busy === g.key
            const [short] = g.key.split('|')
            return (
              <li
                key={g.key}
                className="rounded-lg border border-border/60 bg-card/50 backdrop-blur transition-colors duration-150"
              >
                <div className="flex flex-wrap items-center gap-3 p-3">
                  {/* The row is a doorway, not a workspace. The queue answers
                      "what next"; the workbench answers "who is in this set" and
                      needs the screen to do it. */}
                  <Link
                    // Carry the queue's own view along, so leaving the workbench
                    // returns to the list the operator was actually working from.
                    href={`/archive/workbench?group=${encodeURIComponent(g.key)}&from=${view}`}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{short}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">alias</span>
                    <span className="truncate font-medium">
                      {g.aliasToken || <em className="text-muted-foreground">none in folder name</em>}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {g.folders} folder{g.folders === 1 ? '' : 's'}
                      {g.openFolders < g.folders && ` · ${g.openFolders} open`}
                    </span>
                    {g.demotedFolders > 0 && (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400"
                        title={`${g.demotedFolders} folder(s) carry a suggestion that needs a look`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {g.demotedFolders}
                      </span>
                    )}
                  </Link>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {g.votes.length === 0 ? (
                      <span className="text-sm text-muted-foreground">no suggestion</span>
                    ) : (
                      g.votes.slice(0, 4).map((v) => (
                        <span
                          key={v.icgId}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
                            g.unanimous
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          <PersonIdentity name={v.name} icgId={v.icgId} />
                          <span className="tabular-nums opacity-70">{v.folders}</span>
                        </span>
                      ))
                    )}
                    {g.votes.length > 4 && (
                      <span className="text-xs text-muted-foreground">+{g.votes.length - 4}</span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {g.decision ? (
                      <>
                        <span className="rounded px-2 py-1 text-xs text-muted-foreground">
                          {g.decision === 'CONFIRMED'
                            ? `confirmed · ${g.attributedFolders} attributed`
                            : g.decision === 'NOT_A_PERSON'
                              ? 'not a person'
                              : 'skipped'}
                        </span>
                        <ActionButton onClick={() => undo(g)} busy={isBusy} label="Undo" icon={Undo2} />
                      </>
                    ) : (
                      <>
                        {/* No group-level Confirm. Identity is decided per folder,
                            in the workbench. What remains here are the two verdicts
                            that really are about the whole group. */}
                        <ActionButton onClick={() => notAPerson(g)} busy={isBusy} label="Not a person" icon={UserX} />
                        <ActionButton onClick={() => skip(g)} busy={isBusy} label="Skip" icon={X} />
                      </>
                    )}
                  </div>
                </div>

                {flash?.key === g.key && (
                  <p
                    className={cn(
                      'border-t border-border/60 px-3 py-2 text-sm',
                      flash.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive',
                    )}
                    role="status"
                  >
                    {flash.text}
                  </p>
                )}

              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

type ActionButtonProps = {
  onClick: () => void
  busy: boolean
  disabled?: boolean
  label: string
  icon: typeof UserX
  tone?: 'primary' | 'default'
}

function ActionButton({ onClick, busy, disabled, label, icon: Icon, tone = 'default' }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      title={label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'primary'
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
